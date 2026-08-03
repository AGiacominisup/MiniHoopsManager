import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes";
import { tournamentRouter } from "../modules/tournaments/tournament.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "MiniHoopsManager API" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/tournaments", tournamentRouter);
