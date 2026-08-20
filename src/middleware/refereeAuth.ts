import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { jwtConfig } from "../config/jwt";
import { CourtAccessCodeModel } from "../modules/courtAccess/courtAccessCode.model";
import type { RefereeJwtPayload } from "../modules/courtAccess/courtAccess.service";
import { ApiError } from "../utils/ApiError";

export const requireRefereeSession = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const bearerMatch = authHeader?.match(/^Bearer\s+(\S+)$/i);

  if (!bearerMatch) {
    throw new ApiError(401, "Missing or invalid authorization header");
  }

  let payload: Partial<RefereeJwtPayload>;
  try {
    payload = jwt.verify(bearerMatch[1], jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm]
    }) as Partial<RefereeJwtPayload>;
  } catch (error: unknown) {
    console.warn("Referee JWT verification failed", {
      method: req.method,
      path: req.originalUrl,
      reason: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error"
    });

    throw new ApiError(401, "Invalid token");
  }

  // A staff token verifies with the same secret, so the discriminator is checked
  // strictly here, exactly as requireAuth rejects referee tokens.
  if (
    payload.kind !== "referee" ||
    !payload.sessionId ||
    !payload.tournamentId ||
    !payload.courtId ||
    !payload.tokenVersion
  ) {
    throw new ApiError(401, "Invalid token");
  }

  // A stateless token cannot be revoked, and staff must be able to unpair a
  // stolen tablet, so the version is verified against the court on every call.
  const access = await CourtAccessCodeModel.findOne({
    tournamentId: payload.tournamentId,
    courtId: payload.courtId,
    revokedAt: null
  });
  if (!access || access.tokenVersion !== payload.tokenVersion) {
    throw new ApiError(401, "Court session has been revoked");
  }

  req.refereeSession = {
    sessionId: payload.sessionId,
    tournamentId: payload.tournamentId,
    courtId: payload.courtId
  };
  next();
};
