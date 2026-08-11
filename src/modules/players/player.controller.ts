import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema } from "../../utils/validation";
import { RegistrationModel } from "../registrations/registration.model";
import { PlayerModel } from "./player.model";
import { createPlayerSchema, updatePlayerSchema } from "./player.validation";

export const createPlayer = async (req: Request, res: Response): Promise<void> => {
  const body = createPlayerSchema.parse(req.body);
  const player = await PlayerModel.create({
    ...body,
    ...(body.birthDate && { birthDate: new Date(body.birthDate) })
  });

  res.status(201).json({ message: "Player created", player });
};

export const listPlayers = async (_req: Request, res: Response): Promise<void> => {
  const players = await PlayerModel.find().sort({ lastName: 1, firstName: 1 });
  res.status(200).json({ players });
};

export const getPlayer = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const player = await PlayerModel.findById(id);

  if (!player) {
    throw new ApiError(404, "Player not found");
  }

  res.status(200).json({ player });
};

export const updatePlayer = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = updatePlayerSchema.parse(req.body);
  const player = await PlayerModel.findByIdAndUpdate(
    id,
    {
      ...body,
      ...(body.birthDate && { birthDate: new Date(body.birthDate) })
    },
    { new: true, runValidators: true }
  );

  if (!player) {
    throw new ApiError(404, "Player not found");
  }

  res.status(200).json({ message: "Player updated", player });
};

export const deletePlayer = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const hasRegistrations = await RegistrationModel.exists({ playerId: id });
  if (hasRegistrations) {
    throw new ApiError(409, "Player cannot be deleted while registrations exist");
  }

  const player = await PlayerModel.findByIdAndDelete(id);

  if (!player) {
    throw new ApiError(404, "Player not found");
  }

  res.status(200).json({ message: "Player deleted" });
};