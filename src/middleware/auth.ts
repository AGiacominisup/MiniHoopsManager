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

  let payload: Partial<JwtPayload>;
  try {
    payload = jwt.verify(token, jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm]
    }) as Partial<JwtPayload>;
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

  // Referee session tokens are signed with the same secret, so a successful
  // verification is not authorization. Anything that is not a user token is
  // refused here: most read routes carry requireAuth without requireRole, so
  // this is the only place the boundary can be enforced.
  if (!payload.userId || !payload.role) {
    console.warn("JWT rejected: not a user token", {
      method: req.method,
      path: req.originalUrl
    });

    throw new ApiError(401, "Invalid token");
  }

  req.user = {
    userId: payload.userId,
    role: payload.role
  };
  next();
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

export const requireBackofficeUser = requireRole(["admin", "coach", "staff"]);
