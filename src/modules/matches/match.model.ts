import { type HydratedDocument, Schema, model } from "mongoose";

export type MatchPhase = "qualification" | "final";
export type MatchStatus = "scheduled" | "in_progress" | "completed";
export type MatchSide = "A" | "B";

export interface MatchPlayerSnapshot {
  registrationId: Schema.Types.ObjectId;
  jerseyNumber?: number;
  name?: string;
}

export interface MatchTeam {
  side: MatchSide;
  players: MatchPlayerSnapshot[];
}

export interface MatchDocument {
  tournamentId: Schema.Types.ObjectId;
  courtId: Schema.Types.ObjectId;
  finalGroupId: Schema.Types.ObjectId | null;
  phase: MatchPhase;
  scheduledAt: Date;
  status: MatchStatus;
  scoreA: number;
  scoreB: number;
  teams: MatchTeam[];
}

const matchPlayerSnapshotSchema = new Schema<MatchPlayerSnapshot>(
  {
    registrationId: { type: Schema.Types.ObjectId, ref: "Registration", required: true },
    jerseyNumber: { type: Number, min: 0 },
    name: { type: String, trim: true }
  },
  { _id: false }
);

matchPlayerSnapshotSchema.pre(
  "validate",
  function (this: HydratedDocument<MatchPlayerSnapshot>) {
    const hasJerseyNumber = this.jerseyNumber !== undefined && this.jerseyNumber !== null;
    const hasName = Boolean(this.name);

    if (!hasJerseyNumber && !hasName) {
      throw new Error("Each match player must have either a jersey number or a name.");
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
    courtId: { type: Schema.Types.ObjectId, required: true },
    finalGroupId: { type: Schema.Types.ObjectId, default: null },
    phase: { type: String, enum: ["qualification", "final"], required: true },
    scheduledAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed"],
      default: "scheduled"
    },
    scoreA: { type: Number, default: 0, min: 0 },
    scoreB: { type: Number, default: 0, min: 0 },
    teams: {
      type: [matchTeamSchema],
      validate: {
        validator: (teams: MatchTeam[]) => {
          return teams.length === 2 && new Set(teams.map((team) => team.side)).size === 2;
        },
        message: "A match must contain exactly two teams, A and B."
      }
    }
  },
  {
    timestamps: true
  }
);

matchSchema.index({ tournamentId: 1 });
matchSchema.index({ tournamentId: 1, phase: 1 });
matchSchema.index({ tournamentId: 1, finalGroupId: 1 });

export const MatchModel = model<MatchDocument>("Match", matchSchema);