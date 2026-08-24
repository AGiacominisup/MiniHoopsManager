import type { NextFunction, Request, Response } from "express";
import { requireAuth, requireRole } from "./auth";

export const requireRefereeUser = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  requireAuth(req, res, () => requireRole(["referee"])(req, res, next));
};