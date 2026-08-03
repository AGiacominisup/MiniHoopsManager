import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { TournamentModel } from "./tournament.model";
import { createTournamentSchema } from "./tournament.validation";

export const createTournament = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const body = createTournamentSchema.parse(req.body);

  const tournament = await TournamentModel.create({
    name: body.name,
    season: body.season,
    location: body.location,
    startDate: new Date(body.startDate),
    endDate: new Date(body.endDate),
    ageCategory: body.ageCategory,
    createdBy: req.user.userId
  });

  res.status(201).json({ message: "Tournament created", tournament });
};

export const listTournaments = async (_req: Request, res: Response): Promise<void> => {
  const tournaments = await TournamentModel.find().sort({ startDate: 1 });
  res.status(200).json({ tournaments });
};
