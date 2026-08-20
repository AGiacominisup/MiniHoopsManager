import { Schema, model } from "mongoose";
import type { MatchSide } from "../matches/match.model";

export interface MatchReportBasket {
  side: MatchSide;
  registrationId: Schema.Types.ObjectId;
  points: number;
  assistRegistrationId: Schema.Types.ObjectId | null;
  clientSequence: number;
  clientRecordedAt?: Date;
}

export interface MatchReportFoul {
  side: MatchSide;
  registrationId: Schema.Types.ObjectId;
  clientSequence: number;
  clientRecordedAt?: Date;
}

export interface MatchReportPlayerLine {
  registrationId: Schema.Types.ObjectId;
  side: MatchSide;
  points: number;
  onePointers: number;
  twoPointers: number;
  assists: number;
  fouls: number;
}

export interface MatchReportAwards {
  mvpRegistrationId: Schema.Types.ObjectId | null;
  fairPlayRegistrationId: Schema.Types.ObjectId | null;
}

export interface MatchReportSubmitter {
  kind: "referee_session" | "user";
  sessionId?: string;
  userId?: Schema.Types.ObjectId;
}

export interface MatchReportCorrection {
  revision: number;
  correctedBy: Schema.Types.ObjectId;
  correctedAt: Date;
  note?: string;
  previousScoreA: number;
  previousScoreB: number;
  previousBaskets: MatchReportBasket[];
  previousFouls: MatchReportFoul[];
  previousAwards: MatchReportAwards;
}

export interface MatchReportDocument {
  matchId: Schema.Types.ObjectId;
  tournamentId: Schema.Types.ObjectId;
  courtId: Schema.Types.ObjectId;
  submissionId: string;
  scoreA: number;
  scoreB: number;
  /** Reported score minus the points actually attributed to a player. */
  unattributedPointsA: number;
  unattributedPointsB: number;
  baskets: MatchReportBasket[];
  fouls: MatchReportFoul[];
  boxScore: MatchReportPlayerLine[];
  awards: MatchReportAwards;
  submittedBy: MatchReportSubmitter;
  submittedAt: Date;
  revision: number;
  corrections: MatchReportCorrection[];
  createdAt: Date;
  updatedAt: Date;
}

export const MATCH_REPORT_REVISION_LIMIT = 20;

const basketSchema = new Schema<MatchReportBasket>(
  {
    // Derived from the team that holds the scorer, never accepted from the
    // client: one less field that can contradict itself.
    side: { type: String, enum: ["A", "B"], required: true },
    registrationId: { type: Schema.Types.ObjectId, ref: "Registration", required: true },
    points: {
      type: Number,
      required: true,
      validate: {
        validator: (points: number) => points === 1 || points === 2,
        message: "A basket is worth 1 or 2 points."
      }
    },
    assistRegistrationId: { type: Schema.Types.ObjectId, ref: "Registration", default: null },
    clientSequence: { type: Number, required: true, min: 0 },
    // Informational only. Ordering and every rule use clientSequence, so a
    // tablet with a wrong clock can still submit.
    clientRecordedAt: { type: Date }
  },
  { _id: false }
);

const foulSchema = new Schema<MatchReportFoul>(
  {
    side: { type: String, enum: ["A", "B"], required: true },
    registrationId: { type: Schema.Types.ObjectId, ref: "Registration", required: true },
    clientSequence: { type: Number, required: true, min: 0 },
    clientRecordedAt: { type: Date }
  },
  { _id: false }
);

const playerLineSchema = new Schema<MatchReportPlayerLine>(
  {
    registrationId: { type: Schema.Types.ObjectId, ref: "Registration", required: true },
    side: { type: String, enum: ["A", "B"], required: true },
    points: { type: Number, default: 0, min: 0 },
    onePointers: { type: Number, default: 0, min: 0 },
    twoPointers: { type: Number, default: 0, min: 0 },
    assists: { type: Number, default: 0, min: 0 },
    fouls: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const awardsSchema = new Schema<MatchReportAwards>(
  {
    mvpRegistrationId: { type: Schema.Types.ObjectId, ref: "Registration", default: null },
    fairPlayRegistrationId: { type: Schema.Types.ObjectId, ref: "Registration", default: null }
  },
  { _id: false }
);

const submitterSchema = new Schema<MatchReportSubmitter>(
  {
    kind: { type: String, enum: ["referee_session", "user"], required: true },
    sessionId: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { _id: false }
);

const correctionSchema = new Schema<MatchReportCorrection>(
  {
    revision: { type: Number, required: true, min: 0 },
    correctedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    correctedAt: { type: Date, required: true },
    note: { type: String, trim: true },
    previousScoreA: { type: Number, required: true, min: 0 },
    previousScoreB: { type: Number, required: true, min: 0 },
    previousBaskets: { type: [basketSchema], default: [] },
    previousFouls: { type: [foulSchema], default: [] },
    previousAwards: { type: awardsSchema, required: true }
  },
  { _id: false }
);

// A report lives beside the match rather than inside it: the queue engine loads
// every live match of a tournament on each completion, and the report is a
// mutable, versioned document while the generated match is deliberately not.
const matchReportSchema = new Schema<MatchReportDocument>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    courtId: { type: Schema.Types.ObjectId, required: true },
    // Client-generated, minted once when Submit is tapped and replayed verbatim
    // on every retry: this is what makes a lost response harmless.
    submissionId: { type: String, required: true },
    scoreA: { type: Number, required: true, min: 0 },
    scoreB: { type: Number, required: true, min: 0 },
    unattributedPointsA: { type: Number, default: 0, min: 0 },
    unattributedPointsB: { type: Number, default: 0, min: 0 },
    baskets: { type: [basketSchema], default: [] },
    fouls: { type: [foulSchema], default: [] },
    boxScore: {
      type: [playerLineSchema],
      validate: {
        validator: (lines: MatchReportPlayerLine[]) => lines.length === 6,
        message: "A box score must contain exactly 6 player lines."
      }
    },
    awards: { type: awardsSchema, required: true },
    submittedBy: { type: submitterSchema, required: true },
    submittedAt: { type: Date, required: true },
    revision: { type: Number, default: 0, min: 0 },
    corrections: {
      type: [correctionSchema],
      default: [],
      validate: {
        validator: (corrections: MatchReportCorrection[]) =>
          corrections.length <= MATCH_REPORT_REVISION_LIMIT,
        message: "A match report cannot be corrected more times."
      }
    }
  },
  {
    timestamps: true
  }
);

// One report per match, and one report per submissionId: both are concurrency
// controls, not just constraints.
matchReportSchema.index({ matchId: 1 }, { unique: true });
matchReportSchema.index({ submissionId: 1 }, { unique: true });
matchReportSchema.index({ tournamentId: 1 });

export const MatchReportModel = model<MatchReportDocument>("MatchReport", matchReportSchema);
