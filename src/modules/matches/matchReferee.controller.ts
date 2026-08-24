import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema } from "../../utils/validation";
import {
  assertAssignedReferee,
  listMatchRefereeAvailabilities,
  listRefereeMatches,
  listRefereeTournaments,
  requestRefereeAvailability,
  selectMatchReferee,
  withdrawRefereeAvailability
} from "./matchReferee.service";
import { assignMatchRefereeSchema } from "./matchReferee.validation";

const userId = (req: Request): string => {
  if (!req.user) throw new ApiError(401, "Unauthorized");
  return req.user.userId;
};

export const getRefereeTournaments = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ tournaments: await listRefereeTournaments() });
};

export const getRefereeMatches = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  res.status(200).json({ matches: await listRefereeMatches(id, userId(req)) });
};

export const requestAvailability = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const availability = await requestRefereeAvailability(id, userId(req));
  res.status(200).json({ availability });
};

export const withdrawAvailability = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const availability = await withdrawRefereeAvailability(id, userId(req));
  res.status(200).json({ availability });
};

export const getMatchAvailabilities = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  res.status(200).json({ availabilities: await listMatchRefereeAvailabilities(id) });
};

export const assignMatchReferee = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const { refereeUserId } = assignMatchRefereeSchema.parse(req.body);
  const availability = await selectMatchReferee(id, refereeUserId, userId(req));
  res.status(200).json({ message: "Referee assigned", availability });
};

export const getAssignedMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const match = await assertAssignedReferee(id, userId(req));
  res.status(200).json({ match });
};