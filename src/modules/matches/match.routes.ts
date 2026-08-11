import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
	completeQueuedMatch,
	createMatch,
	deleteMatch,
	getMatch,
	listMatches,
	startQueuedMatch,
	updateMatch
} from "./match.controller";

export const matchRouter = Router();

matchRouter.get("/", requireAuth, asyncHandler(listMatches));
matchRouter.post("/", requireAuth, requireRole(["admin", "staff"]), asyncHandler(createMatch));
matchRouter.post("/:id/start", requireAuth, requireRole(["admin", "staff"]), asyncHandler(startQueuedMatch));
matchRouter.post("/:id/complete", requireAuth, requireRole(["admin", "staff"]), asyncHandler(completeQueuedMatch));
matchRouter.get("/:id", requireAuth, asyncHandler(getMatch));
matchRouter.patch("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(updateMatch));
matchRouter.delete("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(deleteMatch));