import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { requireRefereeSession } from "../../middleware/refereeAuth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  correctMatchReportHandler,
  getMatchReport,
  getRefereeContext,
  startRefereeMatch,
  submitRefereeMatchReport,
  submitStaffMatchReport
} from "./matchReport.controller";

// Mounted on /referee. One authorization rule per route: a staff token is never
// accepted here, and a referee token is never accepted on a staff route.
export const refereeRouter = Router();

refereeRouter.get("/context", asyncHandler(requireRefereeSession), asyncHandler(getRefereeContext));
refereeRouter.post(
  "/matches/:id/start",
  asyncHandler(requireRefereeSession),
  asyncHandler(startRefereeMatch)
);
refereeRouter.post(
  "/matches/:id/report",
  asyncHandler(requireRefereeSession),
  asyncHandler(submitRefereeMatchReport)
);

// Mounted on /matches alongside matchRouter.
export const matchReportRouter = Router();

matchReportRouter.get("/:id/report", requireAuth, asyncHandler(getMatchReport));
matchReportRouter.post(
  "/:id/report",
  requireAuth,
  requireRole(["admin", "staff"]),
  asyncHandler(submitStaffMatchReport)
);
matchReportRouter.put(
  "/:id/report",
  requireAuth,
  requireRole(["admin", "staff"]),
  asyncHandler(correctMatchReportHandler)
);
