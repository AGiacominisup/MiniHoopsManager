import { Schema, model } from "mongoose";

export type MatchRefereeAvailabilityStatus =
  | "pending"
  | "selected"
  | "withdrawn"
  | "rejected";

export interface MatchRefereeAvailabilityDocument {
  matchId: Schema.Types.ObjectId;
  tournamentId: Schema.Types.ObjectId;
  refereeUserId: Schema.Types.ObjectId;
  status: MatchRefereeAvailabilityStatus;
  requestedAt: Date;
  selectedAt?: Date;
  selectedBy?: Schema.Types.ObjectId;
  withdrawnAt?: Date;
}

const schema = new Schema<MatchRefereeAvailabilityDocument>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    refereeUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "selected", "withdrawn", "rejected"],
      default: "pending",
      required: true
    },
    requestedAt: { type: Date, default: Date.now, required: true },
    selectedAt: { type: Date },
    selectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    withdrawnAt: { type: Date }
  },
  { timestamps: true }
);

schema.index({ matchId: 1, refereeUserId: 1 }, { unique: true });
schema.index({ matchId: 1, status: 1 });
schema.index({ refereeUserId: 1, status: 1 });

export const MatchRefereeAvailabilityModel = model<MatchRefereeAvailabilityDocument>(
  "MatchRefereeAvailability",
  schema
);