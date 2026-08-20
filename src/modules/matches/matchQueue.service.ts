import mongoose, { type ClientSession, Types } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { RegistrationModel } from "../registrations/registration.model";
import { findEnabledCourt, loadTournament } from "../tournaments/tournament.guards";
import { TournamentModel } from "../tournaments/tournament.model";
import {
  MatchModel,
  type MatchDocument,
  type MatchSide,
  type MatchTeam
} from "./match.model";

const registrationIds = (match: MatchDocument): string[] =>
  match.teams.flatMap((team) => team.players.map((player) => String(player.registrationId)));

const teamBySide = (match: MatchDocument, side: MatchSide): MatchTeam => {
  const team = match.teams.find((candidate) => candidate.side === side);
  if (!team) {
    throw new ApiError(500, `Match is missing team ${side}`);
  }
  return team;
};

export interface MatchOutcome {
  teamA: MatchTeam;
  teamB: MatchTeam;
  // null only for a level score, which the format makes impossible: a game is
  // played to a target score and the first side to reach it wins.
  winnerSide: MatchSide | null;
}

// The single definition of "who won". Reading teams positionally instead of by
// side used to credit the wrong three players on any match whose teams were
// stored as [B, A].
export const resolveMatchOutcome = (
  match: MatchDocument,
  scoreA: number,
  scoreB: number
): MatchOutcome => ({
  teamA: teamBySide(match, "A"),
  teamB: teamBySide(match, "B"),
  winnerSide: scoreA === scoreB ? null : scoreA > scoreB ? "A" : "B"
});

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

  const busyPlayers = await loadBusyRegistrationIds(tournamentId, session);
  const lastCompleted = await MatchModel.findOne({ tournamentId, status: "completed" })
    .sort({ completedAt: -1 })
    .session(session);
  const recentlyPlayed = new Set(lastCompleted ? registrationIds(lastCompleted) : []);
  const queuedMatches = await MatchModel.find({
    tournamentId,
    phase: "qualification",
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

  const tournament = await TournamentModel.findById(match.tournamentId).session(session);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  if (!options.skipRegistrationAggregates) {
    const { teamA, teamB, winnerSide } = resolveMatchOutcome(match, scoreA, scoreB);
    const winners = winnerSide === "A" ? teamA : teamB;
    const losers = winnerSide === "A" ? teamB : teamA;
    const winnerScore = Math.max(scoreA, scoreB);
    const loserScore = Math.min(scoreA, scoreB);
    await RegistrationModel.bulkWrite(
      [
        ...winners.players.map((player) => ({
          updateOne: {
            filter: { _id: player.registrationId },
            update: {
              $inc: {
                matchesPlayed: 1,
                wins: winnerSide === null ? 0 : 1,
                rankingPoints: winnerSide === null ? 0 : tournament.winPoints,
                pointsScored: winnerScore,
                pointsAllowed: loserScore
              }
            }
          }
        })),
        ...losers.players.map((player) => ({
          updateOne: {
            filter: { _id: player.registrationId },
            update: {
              $inc: {
                matchesPlayed: 1,
                pointsScored: loserScore,
                pointsAllowed: winnerScore
              }
            }
          }
        }))
      ],
      { session }
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

  const nextMatch = options.skipAssignNext
    ? null
    : await assignNextWithSession(String(match.tournamentId), String(match.courtId), session);

  const remaining = await MatchModel.exists({
    tournamentId: match.tournamentId,
    phase: "qualification",
    status: { $in: ["queued", "ready", "in_progress"] }
  }).session(session);
  if (!remaining) {
    // Once the finals generator exists this transition becomes
    // qualification -> finals, and only the last final closes the tournament.
    await TournamentModel.updateOne(
      { _id: tournament._id, status: "qualification" },
      { $set: { status: "completed" } },
      { session }
    );
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