import { Schema, model } from "mongoose";

export interface CourtAccessCodeDocument {
  tournamentId: Schema.Types.ObjectId;
  courtId: Schema.Types.ObjectId;
  codeHash: string;
  codeLast4: string;
  tokenVersion: number;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  issuedTokenCount: number;
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// One code per court, in its own collection rather than on the court
// subdocument: courts are locked once the tournament leaves draft, while a code
// must stay rotatable during play, and the full tournament document is readable
// by every authenticated user.
const courtAccessCodeSchema = new Schema<CourtAccessCodeDocument>(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    courtId: { type: Schema.Types.ObjectId, required: true },
    // Keyed HMAC, never returned: see hashCourtCode for why it is not bcrypt.
    codeHash: { type: String, required: true, select: false },
    codeLast4: { type: String, required: true },
    tokenVersion: { type: Number, default: 1, min: 1 },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    issuedTokenCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  {
    timestamps: true
  }
);

courtAccessCodeSchema.index({ tournamentId: 1, courtId: 1 }, { unique: true });
courtAccessCodeSchema.index({ codeHash: 1 });
courtAccessCodeSchema.index({ tournamentId: 1 });

export const CourtAccessCodeModel = model<CourtAccessCodeDocument>(
  "CourtAccessCode",
  courtAccessCodeSchema
);
