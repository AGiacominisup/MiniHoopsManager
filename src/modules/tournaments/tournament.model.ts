import { Schema, model } from "mongoose";

export type TournamentStatus = "planned" | "in_progress" | "completed";

export interface Court {
  name: string;
}

export interface FinalGroup {
  themeName: string;
  level: number;
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
}

const courtSchema = new Schema<Court>(
  {
    name: { type: String, required: true, trim: true }
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
    finalGroups: { type: [finalGroupSchema], default: [] }
  },
  {
    timestamps: true
  }
);

export const TournamentModel = model<TournamentDocument>("Tournament", tournamentSchema);
