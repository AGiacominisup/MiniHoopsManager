import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
	assignQueuedMatch,
	completeQueuedMatch,
	createMatch,
	deleteMatch,
	getMatch,
	listMatches,
	startQueuedMatch,
	updateMatch
} from "./match.controller";
import {
	assignMatchReferee,
	getMatchAvailabilities
} from "./matchReferee.controller";

export const matchRouter = Router();

matchRouter.get("/", requireAuth, asyncHandler(listMatches));
matchRouter.post("/", requireAuth, requireRole(["admin", "staff"]), asyncHandler(createMatch));
matchRouter.post("/:id/assign", requireAuth, requireRole(["admin", "staff"]), asyncHandler(assignQueuedMatch));
matchRouter.get("/:id/referee-availability", requireAuth, requireRole(["admin", "staff"]), asyncHandler(getMatchAvailabilities));
matchRouter.post("/:id/referee-assignment", requireAuth, requireRole(["admin", "staff"]), asyncHandler(assignMatchReferee));
matchRouter.post("/:id/start", requireAuth, requireRole(["admin", "staff"]), asyncHandler(startQueuedMatch));
matchRouter.post("/:id/complete", requireAuth, requireRole(["admin", "staff"]), asyncHandler(completeQueuedMatch));
matchRouter.get("/:id", requireAuth, asyncHandler(getMatch));
matchRouter.patch("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(updateMatch));
matchRouter.delete("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(deleteMatch));