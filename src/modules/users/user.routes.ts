import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { createUser, deleteUser, getUser, listUsers, updateUser } from "./user.controller";

export const userRouter = Router();

userRouter.use(requireAuth, requireRole(["admin"]));
userRouter.get("/", asyncHandler(listUsers));
userRouter.post("/", asyncHandler(createUser));
userRouter.get("/:id", asyncHandler(getUser));
userRouter.patch("/:id", asyncHandler(updateUser));
userRouter.delete("/:id", asyncHandler(deleteUser));