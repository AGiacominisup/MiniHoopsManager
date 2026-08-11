import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { MatchModel, type MatchDocument } from "../matches/match.model";
import { PlayerModel } from "../players/player.model";
import { RegistrationModel } from "../registrations/registration.model";
import { buildQualificationPlan, type QualificationPlayer } from "./qualificationScheduler";
import { TournamentModel, type TournamentDocument } from "./tournament.model";

interface QualificationContext {
  tournament: mongoose.HydratedDocument<TournamentDocument>;
  players: QualificationPlayer[];
  rosterFingerprint: string;
}

const buildRosterFingerprint = (
  tournament: mongoose.HydratedDocument<TournamentDocument>,
  registrationIds: string[]
): string => {
  const source = JSON.stringify({
    tournamentId: String(tournament._id),
    registrationIds: [...registrationIds].sort(),
    configuration: {
      gameFormat: tournament.configuration.gameFormat,
      competitionFormat: tournament.configuration.competitionFormat,
      teamSize: tournament.configuration.teamSize,
      playersPerMatch: tournament.configuration.playersPerMatch,
      qualificationAppearancesPerPlayer:
        tournament.configuration.qualificationAppearancesPerPlayer,
      queueMode: tournament.configuration.queueMode
    }
  });
  return createHash("sha256").update(source).digest("hex");
};

const loadQualificationContext = async (tournamentId: string): Promise<QualificationContext> => {
  const tournament = await TournamentModel.findById(tournamentId);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  const registrations = await RegistrationModel.find({
    tournamentId,
    attendanceStatus: "checked_in"
  }).sort({ _id: 1 });
  if (registrations.length < tournament.configuration.playersPerMatch) {
    throw new ApiError(409, "At least 6 checked-in players are required");
  }

  const playerIds = registrations.map((registration) => registration.playerId);
  const playerDocuments = await PlayerModel.find({ _id: { $in: playerIds } });
  const playersById = new Map(playerDocuments.map((player) => [String(player._id), player]));
  const players = registrations.map((registration): QualificationPlayer => {
    const player = playersById.get(String(registration.playerId));
    const name = [player?.firstName, player?.lastName].filter(Boolean).join(" ") || undefined;
    if (registration.jerseyNumber === undefined && !name) {
      throw new ApiError(409, `Registration ${String(registration._id)} has no display identity`);
    }
    return {
      registrationId: String(registration._id),
      ...(registration.jerseyNumber !== undefined && { jerseyNumber: registration.jerseyNumber }),
      ...(name && { name })
    };
  });

  return {
    tournament,
    players,
    rosterFingerprint: buildRosterFingerprint(
      tournament,
      registrations.map((registration) => String(registration._id))
    )
  };
};

export const previewQualification = async (tournamentId: string, requestedSeed?: string) => {
  const context = await loadQualificationContext(tournamentId);
  if (context.tournament.qualification.status !== "draft") {
    throw new ApiError(409, "Qualification matches have already been generated");
  }

  const seed = requestedSeed ?? randomUUID();
  const plan = buildQualificationPlan(
    context.players,
    context.tournament.configuration.qualificationAppearancesPerPlayer,
    seed
  );
  return { ...plan, rosterFingerprint: context.rosterFingerprint };
};

export const generateQualification = async (
  tournamentId: string,
  seed: string,
  expectedFingerprint: string
) => {
  const context = await loadQualificationContext(tournamentId);
  if (
    context.tournament.qualification.status !== "draft" &&
    context.tournament.qualification.seed === seed &&
    context.tournament.qualification.rosterFingerprint === expectedFingerprint
  ) {
    const matches = await MatchModel.find({ tournamentId, phase: "qualification" }).sort({
      queuePosition: 1
    });
    return { tournament: context.tournament, matches, idempotent: true };
  }
  if (context.tournament.qualification.status !== "draft") {
    throw new ApiError(409, "A different qualification plan has already been generated");
  }
  if (context.rosterFingerprint !== expectedFingerprint) {
    throw new ApiError(409, "Roster or tournament configuration changed after preview");
  }

  const plan = buildQualificationPlan(
    context.players,
    context.tournament.configuration.qualificationAppearancesPerPlayer,
    seed
  );
  const session = await mongoose.startSession();
  try {
    let createdMatches: mongoose.HydratedDocument<MatchDocument>[] = [];
    let idempotent = false;
    await session.withTransaction(async () => {
      const freshTournament = await TournamentModel.findOneAndUpdate(
        { _id: tournamentId, "qualification.status": "draft" },
        {
          $set: {
            "qualification.status": "generated",
            "qualification.seed": seed,
            "qualification.rosterFingerprint": expectedFingerprint,
            "qualification.generatedAt": new Date(),
            "qualification.totalMatches": plan.matches.length
          }
        },
        { new: true, runValidators: true, session }
      );
      if (!freshTournament) {
        const existingTournament = await TournamentModel.findById(tournamentId).session(session);
        if (
          existingTournament?.qualification.seed === seed &&
          existingTournament.qualification.rosterFingerprint === expectedFingerprint
        ) {
          createdMatches = await MatchModel.find({ tournamentId, phase: "qualification" })
            .sort({ queuePosition: 1 })
            .session(session);
          context.tournament = existingTournament;
          idempotent = true;
          return;
        }
        throw new ApiError(409, "Tournament qualification is no longer in draft state");
      }

      const existingMatches = await MatchModel.exists({
        tournamentId,
        phase: "qualification"
      }).session(session);
      if (existingMatches) {
        throw new ApiError(409, "Qualification matches already exist for this tournament");
      }

      createdMatches = await MatchModel.create(
        plan.matches.map((match) => ({
          tournamentId,
          courtId: null,
          finalGroupId: null,
          phase: "qualification",
          status: "queued",
          scoreA: 0,
          scoreB: 0,
          teams: match.teams,
          queuePosition: match.queuePosition,
          generationSeed: seed,
          rosterFingerprint: expectedFingerprint
        })),
        { session }
      );

      context.tournament = freshTournament;
    });
    return { tournament: context.tournament, matches: createdMatches, idempotent };
  } finally {
    await session.endSession();
  }
};

export const cancelQualification = async (tournamentId: string): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const tournament = await TournamentModel.findById(tournamentId).session(session);
      if (!tournament) {
        throw new ApiError(404, "Tournament not found");
      }
      const startedMatch = await MatchModel.exists({
        tournamentId,
        phase: "qualification",
        status: { $in: ["ready", "in_progress", "completed"] }
      }).session(session);
      if (startedMatch) {
        throw new ApiError(409, "Qualification cannot be cancelled after a match is assigned");
      }
      await MatchModel.deleteMany({ tournamentId, phase: "qualification", status: "queued" }).session(
        session
      );
      Object.assign(tournament.qualification, { status: "draft", totalMatches: 0 });
      tournament.qualification.seed = undefined;
      tournament.qualification.rosterFingerprint = undefined;
      tournament.qualification.generatedAt = undefined;
      await tournament.save({ session });
    });
  } finally {
    await session.endSession();
  }
};