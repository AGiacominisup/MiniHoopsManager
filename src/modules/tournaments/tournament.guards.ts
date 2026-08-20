import type { ClientSession, HydratedDocument, Types } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { TournamentModel, type Court, type TournamentDocument } from "./tournament.model";

export type TournamentEntity = HydratedDocument<TournamentDocument>;

// Courts are embedded subdocuments, so their _id is not on the Court interface.
export type CourtEntity = Court & { _id: Types.ObjectId };

export const findCourt = (
  tournament: TournamentEntity,
  courtId: string
): CourtEntity | undefined =>
  tournament.courts.find((candidate) => String((candidate as CourtEntity)._id) === courtId) as
    | CourtEntity
    | undefined;

export const findEnabledCourt = (tournament: TournamentEntity, courtId: string): CourtEntity => {
  const court = findCourt(tournament, courtId);

  if (!court || !court.enabled) {
    throw new ApiError(404, "Enabled court not found in tournament");
  }

  return court;
};

export const loadTournament = async (
  tournamentId: string,
  session?: ClientSession
): Promise<TournamentEntity> => {
  const query = TournamentModel.findById(tournamentId);
  const tournament = await (session ? query.session(session) : query);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  return tournament;
};

export const assertRosterUnlocked = (tournament: TournamentEntity): void => {
  if (tournament.status !== "draft") {
    throw new ApiError(409, "Roster is locked once the tournament has started");
  }
};

export const loadUnlockedTournament = async (
  tournamentId: string,
  session?: ClientSession
): Promise<TournamentEntity> => {
  const tournament = await loadTournament(tournamentId, session);
  assertRosterUnlocked(tournament);
  return tournament;
};
