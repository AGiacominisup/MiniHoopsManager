import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createPlayer,
  deletePlayer,
  getPlayer,
  listPlayers,
  updatePlayer
} from "./player.controller";

export const playerRouter = Router();

playerRouter.get("/", requireAuth, asyncHandler(listPlayers));
playerRouter.post("/", requireAuth, requireRole(["admin", "staff"]), asyncHandler(createPlayer));
playerRouter.get("/:id", requireAuth, asyncHandler(getPlayer));
playerRouter.patch("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(updatePlayer));
playerRouter.delete("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(deletePlayer));