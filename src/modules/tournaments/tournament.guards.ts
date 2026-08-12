import type { ClientSession, HydratedDocument } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { TournamentModel, type TournamentDocument } from "./tournament.model";

export type TournamentEntity = HydratedDocument<TournamentDocument>;

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
  if (tournament.qualification.status !== "draft") {
    throw new ApiError(409, "Roster is locked after qualification generation");
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
