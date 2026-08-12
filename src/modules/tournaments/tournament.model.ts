import { Schema, model } from "mongoose";

/**
 * The tournament lifecycle, as a single linear progression:
 *
 *   draft         created; players are being associated, nothing generated yet
 *   qualification the schedule exists and qualification is being played
 *   finals        qualification is over and the final games are being played
 *   completed     everything is played; the tournament is read-only
 *
 * Transitions are driven by the engine, never set directly by a client.
 * `finals` is not reachable yet: the finals generator does not exist, so the
 * last completed qualification game currently moves the tournament straight to
 * `completed`.
 */
export type TournamentStatus = "draft" | "qualification" | "finals" | "completed";

export interface Court {
  name: string;
  enabled: boolean;
  displayOrder: number;
}

export interface FinalGroup {
  themeName: string;
  level: number;
}

export interface TournamentConfiguration {
  gameFormat: "3v3";
  competitionFormat: "individual_rotating_teams";
  teamSize: 3;
  playersPerMatch: 6;
  qualificationAppearancesPerPlayer: number;
  queueMode: "dynamic";
}

export interface QualificationConfiguration {
  seed?: string;
  rosterFingerprint?: string;
  generatedAt?: Date;
  totalMatches: number;
}

export interface TournamentDocument {
  name: string;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  winPoints: number;
  status: TournamentStatus;
  courts: Court[];
  finalGroups: FinalGroup[];
  configuration: TournamentConfiguration;
  qualification: QualificationConfiguration;
}

const courtSchema = new Schema<Court>(
  {
    name: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0, min: 0 }
  },
  { _id: true }
);

const finalGroupSchema = new Schema<FinalGroup>(
  {
    themeName: { type: String, required: true, trim: true },
    level: { type: Number, required: true, min: 1 }
  },
  { _id: true }
);

const tournamentConfigurationSchema = new Schema<TournamentConfiguration>(
  {
    gameFormat: { type: String, enum: ["3v3"], default: "3v3", required: true },
    competitionFormat: {
      type: String,
      enum: ["individual_rotating_teams"],
      default: "individual_rotating_teams",
      required: true
    },
    teamSize: { type: Number, enum: [3], default: 3, required: true },
    playersPerMatch: { type: Number, enum: [6], default: 6, required: true },
    qualificationAppearancesPerPlayer: {
      type: Number,
      min: 1,
      max: 20,
      default: 4,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "qualificationAppearancesPerPlayer must be an integer."
      }
    },
    queueMode: { type: String, enum: ["dynamic"], default: "dynamic", required: true }
  },
  { _id: false }
);

const qualificationConfigurationSchema = new Schema<QualificationConfiguration>(
  {
    seed: { type: String },
    rosterFingerprint: { type: String },
    generatedAt: { type: Date },
    totalMatches: { type: Number, min: 0, default: 0 }
  },
  { _id: false }
);

const tournamentSchema = new Schema<TournamentDocument>(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    category: { type: String, trim: true },
    winPoints: { type: Number, default: 10, min: 1 },
    status: {
      type: String,
      enum: ["draft", "qualification", "finals", "completed"],
      default: "draft"
    },
    courts: { type: [courtSchema], default: [] },
    finalGroups: { type: [finalGroupSchema], default: [] },
    configuration: { type: tournamentConfigurationSchema, default: () => ({}) },
    qualification: { type: qualificationConfigurationSchema, default: () => ({}) }
  },
  {
    timestamps: true
  }
);

export const TournamentModel = model<TournamentDocument>("Tournament", tournamentSchema);
