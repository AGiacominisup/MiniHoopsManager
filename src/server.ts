import { app } from "./app";
import { connectToDatabase } from "./config/database";
import { env } from "./config/env";

const bootstrap = async (): Promise<void> => {
  app.listen(env.PORT, () => {
    console.log(`MiniHoopsManager API listening on port ${env.PORT}`);
  });

  console.log("Starting MiniHoopsManager API and connecting to MongoDB");
  void connectToDatabase()
    .then(() => {
      console.log("Connected to MongoDB");
    })
    .catch((error: unknown) => {
      console.error("Failed to connect to MongoDB", error);
    });
};

bootstrap().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
