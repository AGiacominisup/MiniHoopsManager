import { ApiError } from "../../utils/ApiError";
import { TournamentModel } from "../tournaments/tournament.model";

export const DEFAULT_TARGET_SCORE = 13;
export const TARGET_SCORE_MIN = 1;
export const TARGET_SCORE_MAX = 99;

export interface TournamentTargetScores {
  qualificationTargetScore?: number;
  finalsTargetScore?: number;
}

export const targetScoreForPhase = (
  tournament: TournamentTargetScores | null | undefined,
  phase: string
): number => {
  const qualification = tournament?.qualificationTargetScore ?? DEFAULT_TARGET_SCORE;
  const finals = tournament?.finalsTargetScore ?? qualification;
  return phase === "final" ? finals : qualification;
};

export const assertWinningScoreReachesTarget = (
  scoreA: number,
  scoreB: number,
  targetScore: number
): void => {
  if (Math.max(scoreA, scoreB) < targetScore) {
    throw new ApiError(400, `Winning score must reach the target of ${targetScore}`);
  }
};

interface MatchLike {
  tournamentId: unknown;
  phase: string;
  toJSON?: () => Record<string, unknown>;
}

const asJson = (match: MatchLike): Record<string, unknown> =>
  typeof match.toJSON === "function" ? match.toJSON() : { ...match };

export const presentMatches = async <T extends MatchLike>(
  matches: T[]
): Promise<Array<Record<string, unknown> & { targetScore: number }>> => {
  if (matches.length === 0) {
    return [];
  }

  const ids = [...new Set(matches.map((match) => String(match.tournamentId)))];
  const tournaments = await TournamentModel.find({ _id: { $in: ids } }).select({
    qualificationTargetScore: 1,
    finalsTargetScore: 1
  });
  const byId = new Map(tournaments.map((tournament) => [String(tournament._id), tournament]));

  return matches.map((match) => ({
    ...asJson(match),
    targetScore: targetScoreForPhase(byId.get(String(match.tournamentId)), match.phase)
  }));
};

export const presentMatch = async <T extends MatchLike>(
  match: T
): Promise<Record<string, unknown> & { targetScore: number }> => {
  const [presented] = await presentMatches([match]);
  return presented;
};

export const presentMatchOrNull = async <T extends MatchLike>(
  match: T | null | undefined
): Promise<(Record<string, unknown> & { targetScore: number }) | null> =>
  match ? presentMatch(match) : null;
