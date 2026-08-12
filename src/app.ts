import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { apiRouter } from "./routes";
import { openApiSpec } from "./docs/openapi";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

app.use(helmet());
app.use(cors({
	allowedHeaders: ["Authorization", "Content-Type"],
	preflightContinue: false
}));
app.use(morgan("dev"));
app.use(express.json());

app.use("/api", apiRouter);
app.get("/docs/openapi.json", (_req, res) => {
	res.status(200).json(openApiSpec);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use(errorHandler);
