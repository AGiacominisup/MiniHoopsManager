export const RANKING_WIN_POINTS = 6;
export const RANKING_MVP_POINTS = 4;
export const RANKING_FAIR_PLAY_POINTS = 2;
export const RANKING_POINTS_MADE_POINTS = 2;
export const RANKING_ASSIST_POINTS = 2;
export const RANKING_FOUL_PENALTY = 1;

export interface RankingInputs {
  wins: number;
  mvpAwards: number;
  fairPlayAwards: number;
  pointsMade: number;
  assists: number;
  fouls: number;
}

const EMPTY_RANKING_INPUTS: RankingInputs = {
  wins: 0,
  mvpAwards: 0,
  fairPlayAwards: 0,
  pointsMade: 0,
  assists: 0,
  fouls: 0
};

/**
 * Individual standing from a set of qualification games. Personal points and
 * assists are scored linearly so teammates with the same result are separated
 * by what they did, not by coarse ceil() buckets.
 */
export const computeRankingPoints = (input: RankingInputs): number => {
  const total =
    input.wins * RANKING_WIN_POINTS +
    input.mvpAwards * RANKING_MVP_POINTS +
    input.fairPlayAwards * RANKING_FAIR_PLAY_POINTS +
    input.pointsMade * RANKING_POINTS_MADE_POINTS +
    input.assists * RANKING_ASSIST_POINTS -
    input.fouls * RANKING_FOUL_PENALTY;

  return Math.max(0, total);
};

export const sumRankingInputs = (games: RankingInputs[]): RankingInputs =>
  games.reduce(
    (total, game) => ({
      wins: total.wins + game.wins,
      mvpAwards: total.mvpAwards + game.mvpAwards,
      fairPlayAwards: total.fairPlayAwards + game.fairPlayAwards,
      pointsMade: total.pointsMade + game.pointsMade,
      assists: total.assists + game.assists,
      fouls: total.fouls + game.fouls
    }),
    { ...EMPTY_RANKING_INPUTS }
  );

const combinations = <T>(values: T[], size: number): T[][] => {
  if (size <= 0) {
    return [[]];
  }
  if (size > values.length) {
    return [];
  }
  const result: T[][] = [];
  const visit = (start: number, selected: T[]): void => {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      selected.push(values[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return result;
};

/**
 * Existing formula on the best N games. When the player has N or fewer
 * qualification games this is identical to summing all of them. When they
 * have extras, every subset of size N is scored and the maximum is kept, so
 * an extra game only moves the standing if it beats one of the others.
 */
export const computeBestNRankingPoints = (
  games: RankingInputs[],
  targetGames: number
): number => {
  if (games.length === 0 || targetGames <= 0) {
    return 0;
  }
  if (games.length <= targetGames) {
    return computeRankingPoints(sumRankingInputs(games));
  }
  return Math.max(
    ...combinations(games, targetGames).map((subset) =>
      computeRankingPoints(sumRankingInputs(subset))
    )
  );
};
