import { app } from "./app";
import { connectToDatabase } from "./config/database";
import { env } from "./config/env";

const bootstrap = async (): Promise<void> => {
  console.log("Starting MiniHoopsManager API and connecting to MongoDB");
  await connectToDatabase();
  console.log("Connected to MongoDB");

  app.listen(env.PORT, () => {
    console.log(`MiniHoopsManager API listening on port ${env.PORT}`);
  });
};

bootstrap().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
