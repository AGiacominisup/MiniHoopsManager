export const RANKING_WIN_POINTS = 6;
export const RANKING_MVP_POINTS = 3;
export const RANKING_FAIR_PLAY_POINTS = 2;
export const RANKING_POINTS_MADE_DIVISOR = 10;
export const RANKING_ASSISTS_DIVISOR = 8;
export const RANKING_FOULS_DIVISOR = 5;

export interface RankingInputs {
  wins: number;
  mvpAwards: number;
  fairPlayAwards: number;
  pointsMade: number;
  assists: number;
  fouls: number;
}

/**
 * Individual standing from tournament totals. ceil() is applied to the
 * cumulative box-score counters, not per match: 1 point then 2 more is
 * ceil(3/10) = 1, not 1+1.
 */
export const computeRankingPoints = (input: RankingInputs): number => {
  const total =
    input.wins * RANKING_WIN_POINTS +
    input.mvpAwards * RANKING_MVP_POINTS +
    input.fairPlayAwards * RANKING_FAIR_PLAY_POINTS +
    Math.ceil(input.pointsMade / RANKING_POINTS_MADE_DIVISOR) +
    Math.ceil(input.assists / RANKING_ASSISTS_DIVISOR) -
    Math.ceil(input.fouls / RANKING_FOULS_DIVISOR);

  return Math.max(0, total);
};
