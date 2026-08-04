import { Schema, model } from "mongoose";

export interface PlayerDocument {
  firstName?: string;
  lastName?: string;
  birthDate?: Date;
  guardianContact?: string;
}

const playerSchema = new Schema<PlayerDocument>(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    birthDate: { type: Date },
    guardianContact: { type: String, trim: true }
  },
  {
    timestamps: true
  }
);

export const PlayerModel = model<PlayerDocument>("Player", playerSchema);