import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createRegistration,
  deleteRegistration,
  getRegistration,
  listRegistrations,
  updateRegistration
} from "./registration.controller";

export const registrationRouter = Router();

registrationRouter.get("/", requireAuth, asyncHandler(listRegistrations));
registrationRouter.post("/", requireAuth, requireRole(["admin", "staff"]), asyncHandler(createRegistration));
registrationRouter.get("/:id", requireAuth, asyncHandler(getRegistration));
registrationRouter.patch("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(updateRegistration));
registrationRouter.delete("/:id", requireAuth, requireRole(["admin", "staff"]), asyncHandler(deleteRegistration));