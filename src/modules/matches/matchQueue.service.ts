import mongoose, { type ClientSession, Types } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { recomputeRegistrationAggregates } from "../registrations/registrationAggregates.service";
import { findEnabledCourt, loadTournament } from "../tournaments/tournament.guards";
import { TournamentModel } from "../tournaments/tournament.model";
import { MatchModel, type MatchDocument } from "./match.model";

export { resolveMatchOutcome } from "./matchOutcome";
export type { MatchOutcome } from "./matchOutcome";

const registrationIds = (match: MatchDocument): string[] =>
  match.teams.flatMap((team) => team.players.map((player) => String(player.registrationId)));

// A player cannot be in two games at once: everything reserved or being played
// holds its six players until the game is completed.
const loadBusyRegistrationIds = async (
  tournamentId: string,
  session?: ClientSession
): Promise<Set<string>> => {
  const activeMatches = await MatchModel.find({
    tournamentId,
    status: { $in: ["ready", "in_progress"] }
  }).session(session ?? null);
  return new Set(activeMatches.flatMap(registrationIds));
};

const assertCourtIsFree = async (
  tournamentId: string,
  courtId: string,
  session: ClientSession
) => {
  const tournament = await loadTournament(tournamentId, session);
  findEnabledCourt(tournament, courtId);

  return MatchModel.findOne({
    tournamentId,
    courtId,
    status: { $in: ["scheduled", "ready", "in_progress"] }
  }).session(session);
};

const assignNextWithSession = async (
  tournamentId: string,
  courtId: string,
  session: ClientSession
) => {
  const occupiedMatch = await assertCourtIsFree(tournamentId, courtId, session);
  if (occupiedMatch?.status === "ready") {
    return occupiedMatch;
  }
  if (occupiedMatch) {
    throw new ApiError(409, "Court already has an assigned match");
  }

  const tournament = await loadTournament(tournamentId, session);
  const queuePhase = tournament.status === "finals" ? "final" : "qualification";
  const busyPlayers = await loadBusyRegistrationIds(tournamentId, session);
  const lastCompleted = await MatchModel.findOne({ tournamentId, status: "completed" })
    .sort({ completedAt: -1 })
    .session(session);
  const recentlyPlayed = new Set(lastCompleted ? registrationIds(lastCompleted) : []);
  const queuedMatches = await MatchModel.find({
    tournamentId,
    phase: queuePhase,
    status: "queued"
  })
    .sort({ queuePosition: 1 })
    .session(session);

  const candidates = queuedMatches
    .filter((match) => registrationIds(match).every((id) => !busyPlayers.has(id)))
    .sort((first, second) => {
      const firstRecent = registrationIds(first).filter((id) => recentlyPlayed.has(id)).length;
      const secondRecent = registrationIds(second).filter((id) => recentlyPlayed.has(id)).length;
      return firstRecent - secondRecent || (first.queuePosition ?? 0) - (second.queuePosition ?? 0);
    });
  const candidate = candidates[0];
  if (!candidate) {
    return null;
  }

  const assigned = await MatchModel.findOneAndUpdate(
    { _id: candidate._id, status: "queued", courtId: null },
    { $set: { status: "ready", courtId, assignedAt: new Date() } },
    { new: true, runValidators: true, session }
  );
  if (!assigned) {
    throw new ApiError(409, "Match queue changed while assigning the next match");
  }
  return assigned;
};

export const assignNextMatch = async (tournamentId: string, courtId: string) => {
  const session = await mongoose.startSession();
  try {
    let match: mongoose.HydratedDocument<MatchDocument> | null = null;
    await session.withTransaction(async () => {
      match = await assignNextWithSession(tournamentId, courtId, session);
    });
    return match;
  } finally {
    await session.endSession();
  }
};

const assignMatchWithSession = async (
  matchId: string,
  courtId: string,
  session: ClientSession
) => {
  const match = await MatchModel.findById(matchId).session(session);
  if (!match) {
    throw new ApiError(404, "Match not found");
  }
  // Reassigning the same court is a no-op, so a double click cannot 409.
  if (match.status === "ready" && String(match.courtId) === courtId) {
    return match;
  }
  if (match.status !== "queued") {
    throw new ApiError(409, "Only a queued match can be assigned to a court");
  }

  const tournamentId = String(match.tournamentId);
  const occupiedMatch = await assertCourtIsFree(tournamentId, courtId, session);
  if (occupiedMatch) {
    throw new ApiError(409, "Court already has an assigned match");
  }

  const busyPlayers = await loadBusyRegistrationIds(tournamentId, session);
  const conflicting = registrationIds(match).filter((id) => busyPlayers.has(id));
  if (conflicting.length > 0) {
    throw new ApiError(
      409,
      `Match players are already busy in another match: ${conflicting.join(", ")}`
    );
  }

  const assigned = await MatchModel.findOneAndUpdate(
    { _id: match._id, status: "queued", courtId: null },
    { $set: { status: "ready", courtId, assignedAt: new Date() } },
    { new: true, runValidators: true, session }
  );
  if (!assigned) {
    throw new ApiError(409, "Match was assigned by another request");
  }
  return assigned;
};

export const assignMatchToCourt = async (matchId: string, courtId: string) => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => assignMatchWithSession(matchId, courtId, session));
  } finally {
    await session.endSession();
  }
};

export interface MatchAvailability {
  playable: boolean;
  busyRegistrationIds: string[];
}

// Only queued matches carry an availability: they are the ones the operator can
// still bind to a court. Anything else is already bound, played, or manual.
export const buildAvailabilityMap = async (
  matches: MatchDocument[]
): Promise<Map<string, MatchAvailability>> => {
  const queuedMatches = matches.filter((match) => match.status === "queued");
  const tournamentIds = [...new Set(queuedMatches.map((match) => String(match.tournamentId)))];
  const busyByTournament = new Map(
    await Promise.all(
      tournamentIds.map(
        async (tournamentId) =>
          [tournamentId, await loadBusyRegistrationIds(tournamentId)] as const
      )
    )
  );

  return new Map(
    queuedMatches.map((match) => {
      const busyPlayers = busyByTournament.get(String(match.tournamentId)) ?? new Set<string>();
      const busyRegistrationIds = registrationIds(match).filter((id) => busyPlayers.has(id));
      return [
        String((match as MatchDocument & { _id: Types.ObjectId })._id),
        { playable: busyRegistrationIds.length === 0, busyRegistrationIds }
      ];
    })
  );
};

export const startMatch = async (matchId: string) => {
  const match = await MatchModel.findOneAndUpdate(
    { _id: matchId, status: "ready" },
    { $set: { status: "in_progress", startedAt: new Date() } },
    { new: true, runValidators: true }
  );
  if (!match) {
    const existing = await MatchModel.findById(matchId);
    if (!existing) {
      throw new ApiError(404, "Match not found");
    }
    throw new ApiError(409, "Only a ready match can be started");
  }
  return match;
};

export interface CompleteMatchOptions {
  // A submitted report proves the game was played, so a court operator who
  // forgot to press Start must not be able to strand it.
  allowReady?: boolean;
  // The report path owns every registration counter through
  // recomputeRegistrationAggregates. Two writers to the same counters is how
  // these totals would drift.
  skipRegistrationAggregates?: boolean;
  // A late report for an already completed match must not reserve anything: the
  // court moved on hours ago.
  skipAssignNext?: boolean;
}

export interface CompleteMatchResult {
  match: mongoose.HydratedDocument<MatchDocument>;
  nextMatch: mongoose.HydratedDocument<MatchDocument> | null;
  idempotent: boolean;
}

export const completeMatchWithSession = async (
  matchId: string,
  scoreA: number,
  scoreB: number,
  session: ClientSession,
  options: CompleteMatchOptions = {}
): Promise<CompleteMatchResult> => {
  const match = await MatchModel.findById(matchId).session(session);
  if (!match) {
    throw new ApiError(404, "Match not found");
  }
  if (match.status === "completed") {
    if (match.scoreA !== scoreA || match.scoreB !== scoreB) {
      throw new ApiError(409, "Completed match result cannot be changed");
    }
    return { match, nextMatch: null, idempotent: true };
  }

  const startable = options.allowReady
    ? match.status === "in_progress" || match.status === "ready"
    : match.status === "in_progress";
  if (!startable || !match.courtId) {
    throw new ApiError(
      409,
      options.allowReady
        ? "Only a ready or in-progress match can be completed"
        : "Only an in-progress match can be completed"
    );
  }

  match.set({
    status: "completed",
    scoreA,
    scoreB,
    startedAt: match.startedAt ?? new Date(),
    completedAt: new Date()
  });
  await match.save({ session });

  // Recompute after the match is completed so this result is included. The
  // report path skips this and calls recompute itself once the box score exists.
  if (!options.skipRegistrationAggregates) {
    await recomputeRegistrationAggregates(
      registrationIds(match),
      String(match.tournamentId),
      session
    );
  }

  const nextMatch = options.skipAssignNext
    ? null
    : await assignNextWithSession(String(match.tournamentId), String(match.courtId), session);

  if (match.phase === "final") {
    const remaining = await MatchModel.exists({
      tournamentId: match.tournamentId,
      phase: "final",
      status: { $in: ["queued", "ready", "in_progress"] }
    }).session(session);
    if (!remaining) {
      await TournamentModel.updateOne(
        { _id: match.tournamentId, status: "finals" },
        { $set: { status: "completed" } },
        { session }
      );
    }
  }

  return { match, nextMatch, idempotent: false };
};

export const completeMatch = async (matchId: string, scoreA: number, scoreB: number) => {
  const session = await mongoose.startSession();
  try {
    let result: CompleteMatchResult | undefined;
    await session.withTransaction(async () => {
      result = await completeMatchWithSession(matchId, scoreA, scoreB, session);
    });
    if (!result) {
      throw new ApiError(500, "Match completion did not run");
    }
    return result;
  } finally {
    await session.endSession();
  }
};