import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes";
import {
  courtAccessRouter,
  refereeSessionRouter
} from "../modules/courtAccess/courtAccess.routes";
import { matchRouter } from "../modules/matches/match.routes";
import { matchReportRouter, refereeRouter } from "../modules/matchReports/matchReport.routes";
import { playerRouter } from "../modules/players/player.routes";
import { registrationRouter } from "../modules/registrations/registration.routes";
import { tournamentRouter } from "../modules/tournaments/tournament.routes";
import { userRouter } from "../modules/users/user.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "MiniHoopsManager API" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/tournaments", tournamentRouter);
apiRouter.use("/tournaments", courtAccessRouter);
apiRouter.use("/players", playerRouter);
apiRouter.use("/registrations", registrationRouter);
apiRouter.use("/matches", matchRouter);
apiRouter.use("/matches", matchReportRouter);
apiRouter.use("/referee", refereeSessionRouter);
apiRouter.use("/referee", refereeRouter);
apiRouter.use("/users", userRouter);
