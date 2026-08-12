import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { jwtConfig } from "../config/jwt";
import { ApiError } from "../utils/ApiError";
import type { UserRole } from "../modules/users/user.model";

interface JwtPayload {
  userId: string;
  role: UserRole;
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const bearerMatch = authHeader?.match(/^Bearer\s+(\S+)$/i);

  console.info("JWT authentication", {
    method: req.method,
    path: req.originalUrl,
    authorizationHeaderPresent: Boolean(authHeader),
    bearerFormatRecognized: Boolean(bearerMatch)
  });

  if (!bearerMatch) {
    throw new ApiError(401, "Missing or invalid authorization header");
  }

  const token = bearerMatch[1];

  try {
    const payload = jwt.verify(token, jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm]
    }) as JwtPayload;
    req.user = {
      userId: payload.userId,
      role: payload.role
    };
    next();
  } catch (error: unknown) {
    const reason = error instanceof Error
      ? `${error.name}: ${error.message}`
      : "Unknown JWT verification error";

    console.warn("JWT verification failed", {
      method: req.method,
      path: req.originalUrl,
      reason
    });

    throw new ApiError(401, "Invalid token");
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, "Forbidden");
    }

    next();
  };
};
