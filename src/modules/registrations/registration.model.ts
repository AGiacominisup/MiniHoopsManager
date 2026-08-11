import { type HydratedDocument, Schema, model } from "mongoose";
import { PlayerModel } from "../players/player.model";

export type AttendanceStatus = "registered" | "checked_in" | "withdrawn";

export interface RegistrationDocument {
  tournamentId: Schema.Types.ObjectId;
  playerId: Schema.Types.ObjectId;
  jerseyNumber?: number;
  rankingPoints: number;
  matchesPlayed: number;
  wins: number;
  pointsScored: number;
  pointsAllowed: number;
  finalGroupId: Schema.Types.ObjectId | null;
  attendanceStatus: AttendanceStatus;
  checkedInAt: Date | null;
}

const registrationSchema = new Schema<RegistrationDocument>(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    playerId: { type: Schema.Types.ObjectId, ref: "Player", required: true },
    jerseyNumber: { type: Number, min: 0 },
    rankingPoints: { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    pointsScored: { type: Number, default: 0 },
    pointsAllowed: { type: Number, default: 0 },
    finalGroupId: { type: Schema.Types.ObjectId, default: null },
    attendanceStatus: {
      type: String,
      enum: ["registered", "checked_in", "withdrawn"],
      default: "registered",
      required: true
    },
    checkedInAt: { type: Date, default: null }
  },
  {
    timestamps: true
  }
);

registrationSchema.index({ tournamentId: 1, playerId: 1 }, { unique: true });
registrationSchema.index({ tournamentId: 1, attendanceStatus: 1, checkedInAt: 1 });

registrationSchema.pre("validate", async function (this: HydratedDocument<RegistrationDocument>) {
  if (this.jerseyNumber !== undefined && this.jerseyNumber !== null) {
    return;
  }

  const player = await PlayerModel.findById(this.playerId)
    .select({ firstName: 1, lastName: 1 })
    .lean();

  if (!player || (!player.firstName && !player.lastName)) {
    throw new Error(
      "Registration is invalid: either jerseyNumber or the linked player name must be provided."
    );
  }
});

export const RegistrationModel = model<RegistrationDocument>("Registration", registrationSchema);