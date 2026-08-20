import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema, tournamentCourtParamsSchema } from "../../utils/validation";
import {
  exchangeCourtCode,
  issueCourtAccessCode,
  listCourtAccesses,
  revokeCourtAccessCode
} from "./courtAccess.service";
import { refereeSessionSchema, rotateCourtCodeQuerySchema } from "./courtAccess.validation";
import { formatCourtCode } from "./courtCode";

export const createCourtAccessCode = async (req: Request, res: Response): Promise<void> => {
  const { id, courtId } = tournamentCourtParamsSchema.parse(req.params);
  const { force } = rotateCourtCodeQuerySchema.parse(req.query);
  const userId = req.user?.userId;
  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  const { code, courtAccess, unpairedDevices } = await issueCourtAccessCode(
    id,
    courtId,
    userId,
    force
  );

  res.status(201).json({
    message: "Court access code created",
    // Shown to staff once and never retrievable again.
    code: formatCourtCode(code),
    courtAccess,
    unpairedDevices
  });
};

export const listTournamentCourtAccesses = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const courtAccesses = await listCourtAccesses(id);

  res.status(200).json({ courtAccesses });
};

export const deleteCourtAccessCode = async (req: Request, res: Response): Promise<void> => {
  const { id, courtId } = tournamentCourtParamsSchema.parse(req.params);
  await revokeCourtAccessCode(id, courtId);

  res.status(200).json({ message: "Court access code revoked" });
};

export const createRefereeSession = async (req: Request, res: Response): Promise<void> => {
  const { code } = refereeSessionSchema.parse(req.body);
  // The throttle is keyed on the caller: the code is the secret being guessed,
  // so it must not be the key.
  const throttleKey = req.ip ?? "unknown";
  const session = await exchangeCourtCode(code, throttleKey);

  res.status(200).json(session);
};
