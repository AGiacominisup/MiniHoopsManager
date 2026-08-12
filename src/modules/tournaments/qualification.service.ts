import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { MatchModel, type MatchDocument } from "../matches/match.model";
import { PlayerModel } from "../players/player.model";
import { RegistrationModel } from "../registrations/registration.model";
import {
  buildQualificationPlan,
  type QualificationPlan,
  type QualificationPlayer
} from "./qualificationScheduler";
import { loadTournament, type TournamentEntity } from "./tournament.guards";
import { TournamentModel } from "./tournament.model";

interface QualificationContext {
  tournament: TournamentEntity;
  players: QualificationPlayer[];
  rosterFingerprint: string;
}

const buildRosterFingerprint = (
  tournament: TournamentEntity,
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

/**
 * Single source of truth for "can this tournament be generated?", shared by the
 * setup dashboard and the generation endpoints so the two cannot drift apart.
 */
export const evaluateQualificationReadiness = (
  tournament: TournamentEntity,
  checkedInCount: number
): string[] => {
  const blockers: string[] = [];

  if (checkedInCount < tournament.configuration.playersPerMatch) {
    blockers.push(
      `At least ${tournament.configuration.playersPerMatch} players must be checked in`
    );
  }
  if (!tournament.courts.some((court) => court.enabled)) {
    blockers.push("At least one court must be enabled");
  }
  if (tournament.qualification.status !== "draft") {
    blockers.push("Qualification matches have already been generated");
  }

  return blockers;
};

const loadQualificationContext = async (
  tournamentId: string,
  session?: ClientSession
): Promise<QualificationContext> => {
  const tournament = await loadTournament(tournamentId, session);

  const registrationQuery = RegistrationModel.find({
    tournamentId,
    attendanceStatus: "checked_in"
  }).sort({ _id: 1 });
  const registrations = await (session ? registrationQuery.session(session) : registrationQuery);

  const blockers = evaluateQualificationReadiness(tournament, registrations.length);
  if (blockers.length > 0) {
    throw new ApiError(409, blockers.join("; "));
  }

  const playerIds = registrations.map((registration) => registration.playerId);
  const playerQuery = PlayerModel.find({ _id: { $in: playerIds } });
  const playerDocuments = await (session ? playerQuery.session(session) : playerQuery);
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

/**
 * The scheduler is a pure module and signals invalid input with plain Errors,
 * which the global handler would surface as a 500. These are client-correctable
 * states, so they are translated into conflicts.
 */
const buildPlanOrFail = (context: QualificationContext, seed: string): QualificationPlan => {
  try {
    return buildQualificationPlan(
      context.players,
      context.tournament.configuration.qualificationAppearancesPerPlayer,
      seed
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      409,
      error instanceof Error ? error.message : "Qualification plan could not be generated"
    );
  }
};

export const previewQualification = async (tournamentId: string, requestedSeed?: string) => {
  const context = await loadQualificationContext(tournamentId);
  const seed = requestedSeed ?? randomUUID();
  const plan = buildPlanOrFail(context, seed);

  return { ...plan, rosterFingerprint: context.rosterFingerprint };
};

export const generateQualification = async (
  tournamentId: string,
  seed: string,
  expectedFingerprint: string
) => {
  const tournament = await loadTournament(tournamentId);

  // An already-generated plan is answered before any roster validation, so a
  // retry of a committed generation cannot fail on roster changes that happened
  // after it succeeded.
  if (tournament.qualification.status !== "draft") {
    if (
      tournament.qualification.seed !== seed ||
      tournament.qualification.rosterFingerprint !== expectedFingerprint
    ) {
      throw new ApiError(409, "A different qualification plan has already been generated");
    }

    const matches = await MatchModel.find({ tournamentId, phase: "qualification" }).sort({
      queuePosition: 1
    });
    if (matches.length !== tournament.qualification.totalMatches) {
      throw new ApiError(409, "Stored qualification matches do not match the generated plan");
    }

    return { tournament, matches, idempotent: true };
  }

  const context = await loadQualificationContext(tournamentId);
  if (context.rosterFingerprint !== expectedFingerprint) {
    throw new ApiError(409, "Roster or tournament configuration changed after preview");
  }

  const session = await mongoose.startSession();
  try {
    let createdMatches: mongoose.HydratedDocument<MatchDocument>[] = [];
    let generatedTournament = context.tournament;

    await session.withTransaction(async () => {
      // The roster is re-read and re-fingerprinted inside the transaction: the
      // roster lock only engages once qualification leaves "draft", so the read
      // performed before the transaction is not authoritative.
      const freshContext = await loadQualificationContext(tournamentId, session);
      if (freshContext.rosterFingerprint !== expectedFingerprint) {
        throw new ApiError(409, "Roster or tournament configuration changed during generation");
      }

      const plan = buildPlanOrFail(freshContext, seed);

      const existingMatches = await MatchModel.exists({
        tournamentId,
        phase: "qualification"
      }).session(session);
      if (existingMatches) {
        throw new ApiError(409, "Qualification matches already exist for this tournament");
      }

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
        throw new ApiError(409, "Tournament qualification is no longer in draft state");
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

      generatedTournament = freshTournament;
    });

    return { tournament: generatedTournament, matches: createdMatches, idempotent: false };
  } finally {
    await session.endSession();
  }
};

export const cancelQualification = async (tournamentId: string): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const tournament = await loadTournament(tournamentId, session);
      const startedMatch = await MatchModel.exists({
        tournamentId,
        phase: "qualification",
        status: { $in: ["ready", "in_progress", "completed"] }
      }).session(session);
      if (startedMatch) {
        throw new ApiError(409, "Qualification cannot be cancelled after a match is assigned");
      }

      // Every qualification match is removed, not only the queued ones: leaving
      // one behind would block regeneration forever while cancel reports success.
      await MatchModel.deleteMany({ tournamentId, phase: "qualification" }).session(session);

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
