import mongoose from "mongoose";
import { connectToDatabase } from "../config/database";
import { TournamentModel } from "../modules/tournaments/tournament.model";

/**
 * One-off migration for the lifecycle refactor that replaced the
 * planned/in_progress/completed statuses with draft/qualification/finals/completed.
 *
 * Documents written before that change still hold a legacy status, which now fails schema
 * validation on every save() — updating a tournament, starting it or completing a match all
 * return "Database validation error". updateMany skips validators, so it can repair them.
 */
const statusMigrations = [
  { from: "planned", to: "draft" },
  { from: "in_progress", to: "qualification" }
] as const;

const migrate = async (): Promise<void> => {
  await connectToDatabase();

  try {
    for (const { from, to } of statusMigrations) {
      const { modifiedCount } = await TournamentModel.collection.updateMany(
        { status: from },
        { $set: { status: to } }
      );
      console.log(`status "${from}" -> "${to}": ${modifiedCount} tournament(s) updated`);
    }

    // The qualification sub-document lost its own status field in the same refactor.
    const { modifiedCount } = await TournamentModel.collection.updateMany(
      { "qualification.status": { $exists: true } },
      { $unset: { "qualification.status": "" } }
    );
    console.log(`legacy qualification.status removed from ${modifiedCount} tournament(s)`);
  } finally {
    await mongoose.disconnect();
  }
};

migrate().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
