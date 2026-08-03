import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { createTournament, listTournaments } from "./tournament.controller";

export const tournamentRouter = Router();

tournamentRouter.get("/", requireAuth, listTournaments);
tournamentRouter.post("/", requireAuth, requireRole(["admin", "staff"]), createTournament);
