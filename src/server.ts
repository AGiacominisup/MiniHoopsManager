import { app } from "./app";
import { connectToDatabase } from "./config/database";
import { env } from "./config/env";

const bootstrap = async (): Promise<void> => {
  await connectToDatabase();

  app.listen(env.PORT, () => {
    console.log(`MiniHoopsManager API listening on port ${env.PORT}`);
  });
};

bootstrap().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
