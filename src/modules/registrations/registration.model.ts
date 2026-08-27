import { type HydratedDocument, Schema, model } from "mongoose";
import { PlayerModel } from "../players/player.model";

export type AttendanceStatus = "registered" | "checked_in" | "withdrawn";

export interface RegistrationDocument {
  tournamentId: Schema.Types.ObjectId;
  playerId: Schema.Types.ObjectId;
  jerseyNumber?: number;
  skillRating?: number;
  rankingPoints: number;
  matchesPlayed: number;
  wins: number;
  /** Team score of every game played, not this player's own points. */
  pointsScored: number;
  /** Team score conceded in every game played. */
  pointsAllowed: number;
  /** Points this player scored personally, from the submitted match reports. */
  pointsMade: number;
  assists: number;
  fouls: number;
  mvpAwards: number;
  fairPlayAwards: number;
  finalGroupId: Schema.Types.ObjectId | null;
  /** 1-based qualification standing, set when finals are generated. */
  qualificationRank: number | null;
  attendanceStatus: AttendanceStatus;
  checkedInAt: Date | null;
}

const registrationSchema = new Schema<RegistrationDocument>(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    playerId: { type: Schema.Types.ObjectId, ref: "Player", required: true },
    jerseyNumber: { type: Number, min: 0 },
    // Snapshot of Player.skillRating taken at registration time, and the
    // per-tournament override. Left unset when the player has no rating, so an
    // absent value means "fall back to the player record".
    skillRating: { type: Number, min: 0, max: 10 },
    // Every counter below is engine-managed: recomputeRegistrationAggregates is
    // the only writer. rankingPoints is the standing formula on the best N
    // qualification games, not a sum of the display totals (which include extras).
    rankingPoints: { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    // Team score, copied onto all three teammates. Individual scoring is
    // pointsMade: do not confuse the two.
    pointsScored: { type: Number, default: 0 },
    pointsAllowed: { type: Number, default: 0 },
    pointsMade: { type: Number, default: 0, min: 0 },
    assists: { type: Number, default: 0, min: 0 },
    fouls: { type: Number, default: 0, min: 0 },
    mvpAwards: { type: Number, default: 0, min: 0 },
    fairPlayAwards: { type: Number, default: 0, min: 0 },
    finalGroupId: { type: Schema.Types.ObjectId, default: null },
    qualificationRank: { type: Number, default: null, min: 1 },
    attendanceStatus: {
      type: String,
      enum: ["registered", "checked_in", "withdrawn"],
      default: "registered",
      required: true
    },
    checkedInAt: { type: Date, default: null }
  },
  {
    timestamps: true
  }
);

registrationSchema.index({ tournamentId: 1, playerId: 1 }, { unique: true });
registrationSchema.index({ tournamentId: 1, attendanceStatus: 1, checkedInAt: 1 });

registrationSchema.pre("validate", async function (this: HydratedDocument<RegistrationDocument>) {
  if (this.jerseyNumber !== undefined && this.jerseyNumber !== null) {
    return;
  }

  const player = await PlayerModel.findById(this.playerId)
    .select({ firstName: 1, lastName: 1 })
    .lean();

  if (!player || (!player.firstName && !player.lastName)) {
    throw new Error(
      "Registration is invalid: at least one of jerseyNumber or the linked player name must be provided."
    );
  }
});

export const RegistrationModel = model<RegistrationDocument>("Registration", registrationSchema);