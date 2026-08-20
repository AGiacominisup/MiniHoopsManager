import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createCourtAccessCode,
  createRefereeSession,
  deleteCourtAccessCode,
  listTournamentCourtAccesses
} from "./courtAccess.controller";

// Mounted on /tournaments alongside tournamentRouter.
export const courtAccessRouter = Router();

courtAccessRouter.get("/:id/access-codes", requireAuth, asyncHandler(listTournamentCourtAccesses));
courtAccessRouter.post(
  "/:id/courts/:courtId/access-code",
  requireAuth,
  requireRole(["admin", "staff"]),
  asyncHandler(createCourtAccessCode)
);
courtAccessRouter.delete(
  "/:id/courts/:courtId/access-code",
  requireAuth,
  requireRole(["admin", "staff"]),
  asyncHandler(deleteCourtAccessCode)
);

// The only public endpoint of the referee app: it trades a court code for a
// scoped token.
export const refereeSessionRouter = Router();

refereeSessionRouter.post("/session", asyncHandler(createRefereeSession));
