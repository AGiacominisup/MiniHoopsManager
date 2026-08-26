import mongoose from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { TournamentModel } from "../tournaments/tournament.model";
import { MatchModel } from "./match.model";
import {
  MatchRefereeAvailabilityModel,
  type MatchRefereeAvailabilityDocument
} from "./matchRefereeAvailability.model";

const loadMatch = async (matchId: string) => {
  const match = await MatchModel.findById(matchId);
  if (!match) throw new ApiError(404, "Match not found");
  return match;
};

const assertCandidateMatch = (match: { courtId: unknown; status: string }): void => {
  if (!match.courtId || match.status === "completed") {
    throw new ApiError(409, "Only an assigned, incomplete match can accept referees");
  }
};

export const listRefereeTournaments = async () =>
  TournamentModel.find({ status: { $ne: "completed" } })
    .select({ name: 1, status: 1, courts: 1 })
    .sort({ createdAt: -1 });

export const listRefereeMatches = async (tournamentId: string, refereeUserId: string) => {
  const matches = await MatchModel.find({
    tournamentId,
    courtId: { $ne: null },
    status: { $ne: "completed" }
  }).sort({ scheduledAt: 1, queuePosition: 1 });
  const availabilities = await MatchRefereeAvailabilityModel.find({
    tournamentId,
    refereeUserId
  });
  const availabilityByMatch = new Map(
    availabilities.map((availability) => [String(availability.matchId), availability])
  );
  return matches.map((match) => ({
    ...match.toJSON(),
    refereeAvailability: availabilityByMatch.get(String(match._id)) ?? null
  }));
};

export const requestRefereeAvailability = async (matchId: string, refereeUserId: string) => {
  const match = await loadMatch(matchId);
  assertCandidateMatch(match);
  const existing = await MatchRefereeAvailabilityModel.findOne({ matchId, refereeUserId });
  if (existing) {
    if (existing.status === "withdrawn" || existing.status === "rejected") {
      existing.set({ status: "pending", requestedAt: new Date(), withdrawnAt: undefined });
      return existing.save();
    }
    return existing;
  }
  return MatchRefereeAvailabilityModel.create({
    matchId,
    tournamentId: match.tournamentId,
    refereeUserId,
    status: "pending"
  });
};

export const withdrawRefereeAvailability = async (matchId: string, refereeUserId: string) => {
  const availability = await MatchRefereeAvailabilityModel.findOne({ matchId, refereeUserId });
  if (!availability) throw new ApiError(404, "Availability request not found");
  if (availability.status === "selected") {
    throw new ApiError(409, "Selected referee cannot withdraw from this match");
  }
  availability.set({ status: "withdrawn", withdrawnAt: new Date() });
  return availability.save();
};

export const listMatchRefereeAvailabilities = async (matchId: string) => {
  await loadMatch(matchId);
  return MatchRefereeAvailabilityModel.find({
    matchId,
    status: { $in: ["pending", "selected"] }
  })
    .populate("refereeUserId", "email name")
    .sort({ requestedAt: 1 });
};

export const selectMatchReferee = async (
  matchId: string,
  refereeUserId: string,
  selectedBy: string
): Promise<MatchRefereeAvailabilityDocument> => {
  const session = await mongoose.startSession();
  try {
    let selected: MatchRefereeAvailabilityDocument | undefined;
    await session.withTransaction(async () => {
      const match = await MatchModel.findById(matchId).session(session);
      if (!match) throw new ApiError(404, "Match not found");
      if (match.status === "completed" || !match.courtId) {
        throw new ApiError(409, "Only an assigned, incomplete match can have a referee");
      }
      if (match.status === "in_progress") {
        throw new ApiError(409, "A referee cannot be changed after the match starts");
      }
      const candidate = await MatchRefereeAvailabilityModel.findOne({
        matchId,
        refereeUserId,
        status: "pending"
      }).session(session);
      if (!candidate) throw new ApiError(404, "Pending referee availability not found");

      await MatchRefereeAvailabilityModel.updateMany(
        { matchId, status: "pending", _id: { $ne: candidate._id } },
        { $set: { status: "rejected" } },
        { session }
      );
      candidate.set({ status: "selected", selectedAt: new Date(), selectedBy });
      await candidate.save({ session });
      match.set({
        refereeUserId,
        refereeAssignedAt: new Date(),
        refereeAssignedBy: selectedBy
      });
      await match.save({ session });
      selected = candidate;
    });
    if (!selected) throw new ApiError(500, "Referee selection did not run");
    return selected;
  } finally {
    await session.endSession();
  }
};

export const assertAssignedReferee = async (matchId: string, refereeUserId: string) => {
  const match = await loadMatch(matchId);
  if (String(match.refereeUserId) !== refereeUserId) {
    throw new ApiError(403, "Referee is not assigned to this match");
  }
  return match;
};