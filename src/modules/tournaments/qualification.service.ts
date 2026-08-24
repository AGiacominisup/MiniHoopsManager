import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { MatchModel, type MatchDocument } from "../matches/match.model";
import { PlayerModel } from "../players/player.model";
import {
  hasPlayerDisplayIdentity,
  playerDisplayName,
  resolveJerseyNumber
} from "../players/playerIdentity";
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
  players: QualificationPlayer[]
): string => {
  const source = JSON.stringify({
    tournamentId: String(tournament._id),
    // Skill ratings are part of the roster identity: they change the generated
    // plan, so editing one between preview and generate must invalidate the
    // preview just like adding or removing a player does.
    roster: players
      .map((player) => `${player.registrationId}:${player.skillRating ?? ""}`)
      .sort(),
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
  if (tournament.status !== "draft") {
    blockers.push("The tournament has already started");
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
    const name = playerDisplayName(player);
    // Registration jersey number wins as a per-tournament override; the player
    // record is the fallback so older registrations that only stored a name
    // still surface the number on generated matches.
    const jerseyNumber = resolveJerseyNumber(registration.jerseyNumber, player?.jerseyNumber);
    if (!hasPlayerDisplayIdentity(name, jerseyNumber)) {
      throw new ApiError(409, `Registration ${String(registration._id)} has no display identity`);
    }
    // The registration snapshot wins, so a per-tournament override sticks. Falling
    // back to the player record keeps registrations created before skill ratings
    // existed correct without a migration. Absent on both sides, the scheduler
    // treats the player as average.
    const skillRating = registration.skillRating ?? player?.skillRating;
    return {
      registrationId: String(registration._id),
      ...(jerseyNumber !== undefined && { jerseyNumber }),
      ...(name && { name }),
      ...(skillRating !== undefined && { skillRating })
    };
  });

  return {
    tournament,
    players,
    rosterFingerprint: buildRosterFingerprint(tournament, players)
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

/**
 * Claims the tournament and writes the plan. Shared by the two-step
 * preview/generate handshake and the one-shot start action.
 */
const persistQualificationPlan = async (
  tournamentId: string,
  plan: QualificationPlan,
  seed: string,
  rosterFingerprint: string,
  session: ClientSession
): Promise<{
  tournament: TournamentEntity;
  matches: mongoose.HydratedDocument<MatchDocument>[];
}> => {
  const existingMatches = await MatchModel.exists({
    tournamentId,
    phase: "qualification"
  }).session(session);
  if (existingMatches) {
    throw new ApiError(409, "Qualification matches already exist for this tournament");
  }

  const tournament = await TournamentModel.findOneAndUpdate(
    { _id: tournamentId, status: "draft" },
    {
      $set: {
        status: "qualification",
        "qualification.seed": seed,
        "qualification.rosterFingerprint": rosterFingerprint,
        "qualification.generatedAt": new Date(),
        "qualification.totalMatches": plan.matches.length
      }
    },
    { new: true, runValidators: true, session }
  );
  if (!tournament) {
    throw new ApiError(409, "The tournament is no longer in draft state");
  }

  // insertMany rather than create: the whole queue goes in with a single bulk
  // write, and create() refuses more than one document inside a session unless
  // it is told to insert them one by one.
  const matches = await MatchModel.insertMany(
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
      rosterFingerprint
    })),
    { session, ordered: true }
  );

  return { tournament, matches };
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
  if (tournament.status !== "draft") {
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
      // roster lock only engages once the tournament leaves "draft", so the read
      // performed before the transaction is not authoritative.
      const freshContext = await loadQualificationContext(tournamentId, session);
      if (freshContext.rosterFingerprint !== expectedFingerprint) {
        throw new ApiError(409, "Roster or tournament configuration changed during generation");
      }

      const plan = buildPlanOrFail(freshContext, seed);
      const persisted = await persistQualificationPlan(
        tournamentId,
        plan,
        seed,
        expectedFingerprint,
        session
      );

      createdMatches = persisted.matches;
      generatedTournament = persisted.tournament;
    });

    return { tournament: generatedTournament, matches: createdMatches, idempotent: false };
  } finally {
    await session.endSession();
  }
};

/**
 * One-shot start: freeze the roster, generate the schedule and put the
 * tournament in play. Everyone still associated is considered present, so the
 * caller does not have to check players in first.
 */
export const startTournament = async (tournamentId: string, requestedSeed?: string) => {
  const tournament = await loadTournament(tournamentId);

  if (tournament.status === "qualification") {
    const matches = await MatchModel.find({ tournamentId, phase: "qualification" }).sort({
      queuePosition: 1
    });
    return { tournament, matches, idempotent: true };
  }
  if (tournament.status !== "draft") {
    throw new ApiError(409, "The tournament has already started");
  }

  // Reported before the automatic check-in so the message names what the caller
  // actually controls: how many players are associated.
  const availablePlayers = await RegistrationModel.countDocuments({
    tournamentId,
    attendanceStatus: { $ne: "withdrawn" }
  });
  if (availablePlayers < tournament.configuration.playersPerMatch) {
    throw new ApiError(
      409,
      `At least ${tournament.configuration.playersPerMatch} players must be associated with the tournament`
    );
  }

  const seed = requestedSeed ?? randomUUID();
  const session = await mongoose.startSession();
  try {
    let createdMatches: mongoose.HydratedDocument<MatchDocument>[] = [];
    let startedTournament = tournament;

    await session.withTransaction(async () => {
      // Withdrawn players keep their status; everyone else is marked present.
      // Already checked-in players keep their original timestamp.
      await RegistrationModel.updateMany(
        { tournamentId, attendanceStatus: "registered" },
        { $set: { attendanceStatus: "checked_in", checkedInAt: new Date() } },
        { session }
      );

      const context = await loadQualificationContext(tournamentId, session);
      const plan = buildPlanOrFail(context, seed);
      const persisted = await persistQualificationPlan(
        tournamentId,
        plan,
        seed,
        context.rosterFingerprint,
        session
      );

      createdMatches = persisted.matches;
      startedTournament = persisted.tournament;
    });

    return { tournament: startedTournament, matches: createdMatches, idempotent: false };
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

      // Cancelling returns the tournament to the roster-building phase.
      tournament.status = "draft";
      tournament.qualification.totalMatches = 0;
      tournament.qualification.seed = undefined;
      tournament.qualification.rosterFingerprint = undefined;
      tournament.qualification.generatedAt = undefined;
      await tournament.save({ session });
    });
  } finally {
    await session.endSession();
  }
};
