import { Schema, model } from "mongoose";

export type TournamentStatus = "planned" | "in_progress" | "completed";
export type QualificationStatus = "draft" | "generated" | "in_progress" | "completed";

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
  status: QualificationStatus;
  seed?: string;
  rosterFingerprint?: string;
  generatedAt?: Date;
  totalMatches: number;
}

export interface TournamentDocument {
  name: string;
  startDate: Date;
  endDate: Date;
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
    qualificationAppearancesPerPlayer: { type: Number, min: 1, default: 4, required: true },
    queueMode: { type: String, enum: ["dynamic"], default: "dynamic", required: true }
  },
  { _id: false }
);

const qualificationConfigurationSchema = new Schema<QualificationConfiguration>(
  {
    status: {
      type: String,
      enum: ["draft", "generated", "in_progress", "completed"],
      default: "draft",
      required: true
    },
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
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    category: { type: String, trim: true },
    winPoints: { type: Number, default: 10, min: 1 },
    status: {
      type: String,
      enum: ["planned", "in_progress", "completed"],
      default: "planned"
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
