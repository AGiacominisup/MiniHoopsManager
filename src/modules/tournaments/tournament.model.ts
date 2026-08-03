import { Schema, model } from "mongoose";

export interface TournamentDocument {
  name: string;
  season: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  ageCategory: string;
  createdBy: Schema.Types.ObjectId;
}

const tournamentSchema = new Schema<TournamentDocument>(
  {
    name: { type: String, required: true, trim: true },
    season: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    ageCategory: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  {
    timestamps: true
  }
);

export const TournamentModel = model<TournamentDocument>("Tournament", tournamentSchema);
