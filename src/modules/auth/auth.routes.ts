import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { login } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(login));
