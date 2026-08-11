import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema } from "../../utils/validation";
import { MatchModel } from "../matches/match.model";
import { RegistrationModel } from "../registrations/registration.model";
import { TournamentModel } from "./tournament.model";
import { createTournamentSchema, updateTournamentSchema } from "./tournament.validation";

export const createTournament = async (req: Request, res: Response): Promise<void> => {
  const body = createTournamentSchema.parse(req.body);

  const tournament = await TournamentModel.create({
    name: body.name,
    startDate: new Date(body.startDate),
    endDate: new Date(body.endDate),
    category: body.category,
    winPoints: body.winPoints,
    status: body.status,
    courts: body.courts ?? [],
    finalGroups: body.finalGroups ?? []
  });

  res.status(201).json({ message: "Tournament created", tournament });
};

export const listTournaments = async (_req: Request, res: Response): Promise<void> => {
  const tournaments = await TournamentModel.find().sort({ startDate: 1 });
  res.status(200).json({ tournaments });
};

export const getTournament = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const tournament = await TournamentModel.findById(id);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  res.status(200).json({ tournament });
};

export const updateTournament = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = updateTournamentSchema.parse(req.body);
  const tournament = await TournamentModel.findById(id);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  const startDate = body.startDate ? new Date(body.startDate) : tournament.startDate;
  const endDate = body.endDate ? new Date(body.endDate) : tournament.endDate;
  if (endDate < startDate) {
    throw new ApiError(400, "endDate must be after startDate");
  }

  tournament.set({
    ...body,
    ...(body.startDate && { startDate }),
    ...(body.endDate && { endDate })
  });
  await tournament.save();

  res.status(200).json({ message: "Tournament updated", tournament });
};

export const deleteTournament = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const hasRelatedResources = await Promise.all([
    RegistrationModel.exists({ tournamentId: id }),
    MatchModel.exists({ tournamentId: id })
  ]);
  if (hasRelatedResources.some(Boolean)) {
    throw new ApiError(409, "Tournament cannot be deleted while registrations or matches exist");
  }

  const tournament = await TournamentModel.findByIdAndDelete(id);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  res.status(200).json({ message: "Tournament deleted" });
};
