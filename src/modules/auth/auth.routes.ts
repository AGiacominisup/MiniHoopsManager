import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { login, loginReferee, registerReferee } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(login));
authRouter.post("/referee/login", asyncHandler(loginReferee));
authRouter.post("/referee/register", asyncHandler(registerReferee));
