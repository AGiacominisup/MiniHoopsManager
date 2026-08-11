import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
	createTournament,
	assignNextTournamentMatch,
	bulkRegisterPlayers,
	cancelTournamentQualification,
	deleteTournament,
	generateTournamentQualification,
	getTournament,
	getTournamentSetup,
	listTournaments,
	previewTournamentQualification,
	updateTournament
} from "./tournament.controller";

export const tournamentRouter = Router();

tournamentRouter.get("/", requireAuth, asyncHandler(listTournaments));
tournamentRouter.post("/", requireAuth, requireRole(["admin", "staff"]), asyncHandler(createTournament));
tournamentRouter.get("/:id/setup", requireAuth, asyncHandler(getTournamentSetup));
tournamentRouter.post("/:id/registrations/bulk", requireAuth, requireRole(["admin", "staff"]), asyncHandler(bulkRegisterPlayers));
tournamentRouter.post("/:id/qualification/preview", requireAuth, requireRole(["admin", "staff"]), asyncHandler(previewTournamentQualification));
tournamentRouter.post("/:id/qualification/generate", requireAuth, requireRole(["admin", "staff"]), asyncHandler(generateTournamentQualification));
tournamentRouter.delete("/:id/qualification", requireAuth, requireRole(["admin", "staff"]), asyncHandler(cancelTournamentQualification));
tournamentRouter.post("/:id/courts/:courtId/assign-next", requireAuth, requireRole(["admin", "staff"]), asyncHandler(assignNextTournamentMatch));
tournamentRouter.get("/:id", requireAuth, asyncHandler(getTournament));
tournamentRouter.patch("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(updateTournament));
tournamentRouter.delete("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(deleteTournament));
