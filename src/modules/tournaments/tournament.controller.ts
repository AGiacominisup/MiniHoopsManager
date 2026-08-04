import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { TournamentModel } from "./tournament.model";
import { createTournamentSchema } from "./tournament.validation";

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
