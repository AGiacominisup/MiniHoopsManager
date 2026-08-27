import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
	createTournament,
	assignNextTournamentMatch,
	bulkRegisterPlayers,
	bulkUnregisterPlayers,
	bulkUpdateAttendance,
	cancelTournamentQualification,
	deleteTournament,
	generateTournamentQualification,
	generateTournamentFinals,
	getTournament,
	getTournamentSetup,
	listAvailablePlayers,
	listTournaments,
	previewTournamentQualification,
	recomputeTournamentAggregates,
	startTournamentQualification,
	updateTournament
} from "./tournament.controller";

export const tournamentRouter = Router();

tournamentRouter.get("/", requireAuth, asyncHandler(listTournaments));
tournamentRouter.post("/", requireAuth, requireRole(["admin", "staff"]), asyncHandler(createTournament));
tournamentRouter.get("/:id/setup", requireAuth, asyncHandler(getTournamentSetup));
tournamentRouter.get("/:id/available-players", requireAuth, asyncHandler(listAvailablePlayers));
tournamentRouter.post("/:id/registrations/bulk", requireAuth, requireRole(["admin", "staff"]), asyncHandler(bulkRegisterPlayers));
tournamentRouter.delete("/:id/registrations/bulk", requireAuth, requireRole(["admin", "staff"]), asyncHandler(bulkUnregisterPlayers));
tournamentRouter.patch("/:id/registrations/attendance", requireAuth, requireRole(["admin", "staff"]), asyncHandler(bulkUpdateAttendance));
tournamentRouter.post("/:id/start", requireAuth, requireRole(["admin", "staff"]), asyncHandler(startTournamentQualification));
tournamentRouter.post("/:id/qualification/preview", requireAuth, requireRole(["admin", "staff"]), asyncHandler(previewTournamentQualification));
tournamentRouter.post("/:id/qualification/generate", requireAuth, requireRole(["admin", "staff"]), asyncHandler(generateTournamentQualification));
tournamentRouter.delete("/:id/qualification", requireAuth, requireRole(["admin", "staff"]), asyncHandler(cancelTournamentQualification));
tournamentRouter.post("/:id/finals/generate", requireAuth, requireRole(["admin", "staff"]), asyncHandler(generateTournamentFinals));
tournamentRouter.post("/:id/courts/:courtId/assign-next", requireAuth, requireRole(["admin", "staff"]), asyncHandler(assignNextTournamentMatch));
tournamentRouter.post("/:id/recompute-aggregates", requireAuth, requireRole(["admin"]), asyncHandler(recomputeTournamentAggregates));
tournamentRouter.get("/:id", requireAuth, asyncHandler(getTournament));
tournamentRouter.patch("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(updateTournament));
tournamentRouter.delete("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(deleteTournament));
