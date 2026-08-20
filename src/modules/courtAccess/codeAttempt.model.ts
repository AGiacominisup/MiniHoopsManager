import { Schema, model } from "mongoose";

export interface CodeAttemptDocument {
  key: string;
  failures: number;
  lockedUntil: Date | null;
  expiresAt: Date;
}

// The code exchange endpoint is public, and there is no rate limiter in the
// app. The counter lives in Mongo rather than in memory so it survives a
// restart and holds across Render instances: an in-process Map is per-instance
// and therefore not a control at all.
const codeAttemptSchema = new Schema<CodeAttemptDocument>(
  {
    key: { type: String, required: true },
    failures: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true }
  },
  {
    timestamps: true
  }
);

codeAttemptSchema.index({ key: 1 }, { unique: true });
codeAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CodeAttemptModel = model<CodeAttemptDocument>("CodeAttempt", codeAttemptSchema);
