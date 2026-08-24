import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  correctMatchReportHandler,
  getMatchReport,
  submitStaffMatchReport
} from "./matchReport.controller";
import {
  getAssignedMatch,
  getRefereeMatches,
  getRefereeTournaments,
  requestAvailability,
  withdrawAvailability
} from "../matches/matchReferee.controller";
import { requireRefereeUser } from "../../middleware/refereeUserAuth";
import {
  startAssignedRefereeMatch,
  submitAssignedRefereeMatchReport
} from "./matchReport.controller";

// Mounted on /referee. One authorization rule per route: a staff token is never
// accepted here, and a referee token is never accepted on a staff route.
export const refereeRouter = Router();

refereeRouter.get("/tournaments", requireRefereeUser, asyncHandler(getRefereeTournaments));
refereeRouter.get("/tournaments/:id/matches", requireRefereeUser, asyncHandler(getRefereeMatches));
refereeRouter.post("/matches/:id/availability", requireRefereeUser, asyncHandler(requestAvailability));
refereeRouter.delete("/matches/:id/availability", requireRefereeUser, asyncHandler(withdrawAvailability));
refereeRouter.get("/matches/:id", requireRefereeUser, asyncHandler(getAssignedMatch));
refereeRouter.post("/matches/:id/start", requireRefereeUser, asyncHandler(startAssignedRefereeMatch));
refereeRouter.post("/matches/:id/report", requireRefereeUser, asyncHandler(submitAssignedRefereeMatchReport));

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
