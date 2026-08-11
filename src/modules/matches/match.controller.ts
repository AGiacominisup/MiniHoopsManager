import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema } from "../../utils/validation";
import { RegistrationModel } from "../registrations/registration.model";
import { TournamentModel } from "../tournaments/tournament.model";
import { MatchModel } from "./match.model";
import { createMatchSchema, matchQuerySchema, updateMatchSchema } from "./match.validation";

interface MatchReferenceTeam {
  players: Array<{ registrationId: unknown }>;
}

const validateMatchReferences = async (
  tournamentId: string,
  courtId: string,
  finalGroupId: string | null | undefined,
  teams: MatchReferenceTeam[]
): Promise<void> => {
  const tournament = await TournamentModel.findById(tournamentId);
  if (!tournament) {
    throw new ApiError(400, "Referenced tournament not found");
  }

  const hasCourt = tournament.courts.some(
    (court) => String((court as typeof court & { _id: unknown })._id) === courtId
  );
  if (!hasCourt) {
    throw new ApiError(400, "courtId does not belong to the tournament");
  }

  if (
    finalGroupId &&
    !tournament.finalGroups.some(
      (group) => String((group as typeof group & { _id: unknown })._id) === finalGroupId
    )
  ) {
    throw new ApiError(400, "finalGroupId does not belong to the tournament");
  }

  const registrationIds = teams.flatMap((team) =>
    team.players.map((player) => String(player.registrationId))
  );
  const registrationCount = await RegistrationModel.countDocuments({
    _id: { $in: registrationIds },
    tournamentId
  });
  if (registrationCount !== registrationIds.length) {
    throw new ApiError(400, "All registrations must exist and belong to the tournament");
  }
};

export const createMatch = async (req: Request, res: Response): Promise<void> => {
  const body = createMatchSchema.parse(req.body);
  await validateMatchReferences(
    body.tournamentId,
    body.courtId,
    body.finalGroupId,
    body.teams
  );

  const match = await MatchModel.create({
    ...body,
    scheduledAt: new Date(body.scheduledAt)
  });
  res.status(201).json({ message: "Match created", match });
};

export const listMatches = async (req: Request, res: Response): Promise<void> => {
  const query = matchQuerySchema.parse(req.query);
  const matches = await MatchModel.find(query).sort({ scheduledAt: 1 });
  res.status(200).json({ matches });
};

export const getMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const match = await MatchModel.findById(id);

  if (!match) {
    throw new ApiError(404, "Match not found");
  }

  res.status(200).json({ match });
};

export const updateMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = updateMatchSchema.parse(req.body);
  const match = await MatchModel.findById(id);

  if (!match) {
    throw new ApiError(404, "Match not found");
  }

  const tournamentId = body.tournamentId ?? String(match.tournamentId);
  const courtId = body.courtId ?? String(match.courtId);
  const finalGroupId = body.finalGroupId === undefined
    ? match.finalGroupId && String(match.finalGroupId)
    : body.finalGroupId;
  const teams = body.teams ?? match.teams;
  await validateMatchReferences(tournamentId, courtId, finalGroupId, teams);

  match.set({
    ...body,
    ...(body.scheduledAt && { scheduledAt: new Date(body.scheduledAt) })
  });
  await match.save();
  res.status(200).json({ message: "Match updated", match });
};

export const deleteMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const match = await MatchModel.findByIdAndDelete(id);

  if (!match) {
    throw new ApiError(404, "Match not found");
  }

  res.status(200).json({ message: "Match deleted" });
};