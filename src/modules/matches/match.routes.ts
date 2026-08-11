import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { createMatch, deleteMatch, getMatch, listMatches, updateMatch } from "./match.controller";

export const matchRouter = Router();

matchRouter.get("/", requireAuth, asyncHandler(listMatches));
matchRouter.post("/", requireAuth, requireRole(["admin", "staff"]), asyncHandler(createMatch));
matchRouter.get("/:id", requireAuth, asyncHandler(getMatch));
matchRouter.patch("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(updateMatch));
matchRouter.delete("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(deleteMatch));