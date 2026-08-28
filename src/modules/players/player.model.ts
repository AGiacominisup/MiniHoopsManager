import { Schema, model } from "mongoose";

export interface PlayerDocument {
  firstName?: string;
  lastName?: string;
  jerseyNumber?: string;
  birthDate?: Date;
  guardianContact?: string;
  skillRating?: number;
}

const playerSchema = new Schema<PlayerDocument>(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    jerseyNumber: { type: String, match: /^\d{1,2}$/ },
    birthDate: { type: Date },
    guardianContact: { type: String, trim: true },
    skillRating: { type: Number, min: 0, max: 10 }
  },
  {
    timestamps: true
  }
);

export const PlayerModel = model<PlayerDocument>("Player", playerSchema);