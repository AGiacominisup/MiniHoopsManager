import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
	createTournament,
	deleteTournament,
	getTournament,
	listTournaments,
	updateTournament
} from "./tournament.controller";

export const tournamentRouter = Router();

tournamentRouter.get("/", requireAuth, asyncHandler(listTournaments));
tournamentRouter.post("/", requireAuth, requireRole(["admin", "staff"]), asyncHandler(createTournament));
tournamentRouter.get("/:id", requireAuth, asyncHandler(getTournament));
tournamentRouter.patch("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(updateTournament));
tournamentRouter.delete("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(deleteTournament));
