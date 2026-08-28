import { type HydratedDocument, Schema, model } from "mongoose";

export type MatchPhase = "qualification" | "final";
/** `in_progress` is kept for matches started before the start step was removed. New games go queued → ready → completed. */
export type MatchStatus = "scheduled" | "queued" | "ready" | "in_progress" | "completed";
export type MatchSide = "A" | "B";

export interface MatchPlayerSnapshot {
  registrationId: Schema.Types.ObjectId;
  jerseyNumber?: string;
  name?: string;
  skillRating?: number;
}

export interface MatchTeam {
  side: MatchSide;
  players: MatchPlayerSnapshot[];
}

export interface MatchDocument {
  tournamentId: Schema.Types.ObjectId;
  courtId: Schema.Types.ObjectId | null;
  finalGroupId: Schema.Types.ObjectId | null;
  phase: MatchPhase;
  scheduledAt?: Date;
  status: MatchStatus;
  scoreA: number;
  scoreB: number;
  teams: MatchTeam[];
  queuePosition?: number;
  generationSeed?: string;
  rosterFingerprint?: string;
  refereeUserId?: Schema.Types.ObjectId | null;
  refereeAssignedAt?: Date;
  refereeAssignedBy?: Schema.Types.ObjectId;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const matchPlayerSnapshotSchema = new Schema<MatchPlayerSnapshot>(
  {
    registrationId: { type: Schema.Types.ObjectId, ref: "Registration", required: true },
    jerseyNumber: { type: String, match: /^\d{1,2}$/ },
    name: { type: String, trim: true },
    skillRating: { type: Number, min: 0, max: 10 }
  },
  { _id: false }
);

matchPlayerSnapshotSchema.pre(
  "validate",
  function (this: HydratedDocument<MatchPlayerSnapshot>) {
    const hasJerseyNumber = this.jerseyNumber !== undefined && this.jerseyNumber !== null;
    const hasName = Boolean(this.name);

    if (!hasJerseyNumber && !hasName) {
      throw new Error("Each match player must have at least a jersey number or a name.");
    }
  }
);

const matchTeamSchema = new Schema<MatchTeam>(
  {
    side: { type: String, enum: ["A", "B"], required: true },
    players: {
      type: [matchPlayerSnapshotSchema],
      validate: {
        validator: (players: MatchPlayerSnapshot[]) => players.length === 3,
        message: "Each team must have exactly 3 players."
      }
    }
  },
  { _id: false }
);

const matchSchema = new Schema<MatchDocument>(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    courtId: { type: Schema.Types.ObjectId, default: null },
    finalGroupId: { type: Schema.Types.ObjectId, default: null },
    phase: { type: String, enum: ["qualification", "final"], required: true },
    scheduledAt: { type: Date },
    status: {
      type: String,
      enum: ["scheduled", "queued", "ready", "in_progress", "completed"],
      default: "queued"
    },
    scoreA: { type: Number, default: 0, min: 0 },
    scoreB: { type: Number, default: 0, min: 0 },
    teams: {
      type: [matchTeamSchema],
      validate: {
        // The order is pinned, not just the set of sides: readers that index
        // teams positionally must never disagree with the side field.
        validator: (teams: MatchTeam[]) => {
          return teams.length === 2 && teams[0].side === "A" && teams[1].side === "B";
        },
        message: "A match must contain exactly two teams, ordered as side A then side B."
      }
    },
    queuePosition: { type: Number, min: 0 },
    generationSeed: { type: String },
    rosterFingerprint: { type: String },
    refereeUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    refereeAssignedAt: { type: Date },
    refereeAssignedBy: { type: Schema.Types.ObjectId, ref: "User" },
    assignedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date }
  },
  {
    timestamps: true
  }
);

matchSchema.index({ tournamentId: 1 });
matchSchema.index({ tournamentId: 1, phase: 1 });
matchSchema.index({ tournamentId: 1, finalGroupId: 1 });
matchSchema.index({ refereeUserId: 1, status: 1 });
matchSchema.index(
  { tournamentId: 1, phase: 1, queuePosition: 1 },
  { unique: true, partialFilterExpression: { queuePosition: { $type: "number" } } }
);
matchSchema.index(
  { tournamentId: 1, courtId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      courtId: { $type: "objectId" },
      status: { $in: ["ready", "in_progress"] }
    }
  }
);

export const MatchModel = model<MatchDocument>("Match", matchSchema);