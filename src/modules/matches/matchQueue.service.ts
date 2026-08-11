import mongoose, { type ClientSession, Types } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { RegistrationModel } from "../registrations/registration.model";
import { TournamentModel } from "../tournaments/tournament.model";
import { MatchModel, type MatchDocument } from "./match.model";

const registrationIds = (match: MatchDocument): string[] =>
  match.teams.flatMap((team) => team.players.map((player) => String(player.registrationId)));

const assignNextWithSession = async (
  tournamentId: string,
  courtId: string,
  session: ClientSession
) => {
  const tournament = await TournamentModel.findById(tournamentId).session(session);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }
  const court = tournament.courts.find(
    (candidate) => String((candidate as typeof candidate & { _id: Types.ObjectId })._id) === courtId
  );
  if (!court || !court.enabled) {
    throw new ApiError(404, "Enabled court not found in tournament");
  }

  const occupiedMatch = await MatchModel.findOne({
    tournamentId,
    courtId,
    status: { $in: ["scheduled", "ready", "in_progress"] }
  }).session(session);
  if (occupiedMatch?.status === "ready") {
    return occupiedMatch;
  }
  if (occupiedMatch) {
    throw new ApiError(409, "Court already has an assigned match");
  }

  const activeMatches = await MatchModel.find({
    tournamentId,
    status: { $in: ["ready", "in_progress"] }
  }).session(session);
  const busyPlayers = new Set(activeMatches.flatMap(registrationIds));
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

export const completeMatch = async (matchId: string, scoreA: number, scoreB: number) => {
  const session = await mongoose.startSession();
  try {
    let completedMatch: mongoose.HydratedDocument<MatchDocument> | null = null;
    let nextMatch: mongoose.HydratedDocument<MatchDocument> | null = null;
    let idempotent = false;
    await session.withTransaction(async () => {
      const match = await MatchModel.findById(matchId).session(session);
      if (!match) {
        throw new ApiError(404, "Match not found");
      }
      if (match.status === "completed") {
        if (match.scoreA !== scoreA || match.scoreB !== scoreB) {
          throw new ApiError(409, "Completed match result cannot be changed");
        }
        completedMatch = match;
        idempotent = true;
        return;
      }
      if (match.status !== "in_progress" || !match.courtId) {
        throw new ApiError(409, "Only an in-progress match can be completed");
      }

      const tournament = await TournamentModel.findById(match.tournamentId).session(session);
      if (!tournament) {
        throw new ApiError(404, "Tournament not found");
      }
      const winners = scoreA > scoreB ? match.teams[0] : match.teams[1];
      const losers = scoreA > scoreB ? match.teams[1] : match.teams[0];
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
                  wins: 1,
                  rankingPoints: tournament.winPoints,
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

      match.set({ status: "completed", scoreA, scoreB, completedAt: new Date() });
      await match.save({ session });
      completedMatch = match;
      nextMatch = await assignNextWithSession(
        String(match.tournamentId),
        String(match.courtId),
        session
      );

      const remaining = await MatchModel.exists({
        tournamentId: match.tournamentId,
        phase: "qualification",
        status: { $in: ["queued", "ready", "in_progress"] }
      }).session(session);
      await TournamentModel.updateOne(
        { _id: tournament._id },
        !remaining
          ? { $set: { "qualification.status": "completed", status: "completed" } }
          : {
              $set: {
                "qualification.status": "in_progress",
                status: "in_progress"
              }
            },
        { session }
      );
    });
    return { match: completedMatch, nextMatch, idempotent };
  } finally {
    await session.endSession();
  }
};