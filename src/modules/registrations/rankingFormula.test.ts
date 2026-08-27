import assert from "node:assert/strict";
import test from "node:test";
import { computeBestNRankingPoints, computeRankingPoints, sumRankingInputs, type RankingInputs } from "./rankingFormula";

test("awards 6 for a win, 3 for MVP and 2 for fair play", () => {
  assert.equal(
    computeRankingPoints({
      wins: 1,
      mvpAwards: 1,
      fairPlayAwards: 1,
      pointsMade: 0,
      assists: 0,
      fouls: 0
    }),
    11
  );
});

test("ceils box-score totals, not each match", () => {
  assert.equal(
    computeRankingPoints({
      wins: 0,
      mvpAwards: 0,
      fairPlayAwards: 0,
      pointsMade: 1,
      assists: 0,
      fouls: 0
    }),
    1
  );
  assert.equal(
    computeRankingPoints({
      wins: 0,
      mvpAwards: 0,
      fairPlayAwards: 0,
      pointsMade: 3,
      assists: 0,
      fouls: 0
    }),
    1
  );
  assert.equal(
    computeRankingPoints({
      wins: 0,
      mvpAwards: 0,
      fairPlayAwards: 0,
      pointsMade: 11,
      assists: 0,
      fouls: 0
    }),
    2
  );
});

test("ceils assists by 8 and subtracts ceiled fouls by 5", () => {
  assert.equal(
    computeRankingPoints({
      wins: 1,
      mvpAwards: 0,
      fairPlayAwards: 0,
      pointsMade: 0,
      assists: 1,
      fouls: 1
    }),
    6
  );
  assert.equal(
    computeRankingPoints({
      wins: 0,
      mvpAwards: 0,
      fairPlayAwards: 0,
      pointsMade: 0,
      assists: 8,
      fouls: 6
    }),
    0
  );
});

test("clamps a foul-heavy standing at zero", () => {
  assert.equal(
    computeRankingPoints({
      wins: 0,
      mvpAwards: 0,
      fairPlayAwards: 0,
      pointsMade: 0,
      assists: 0,
      fouls: 6
    }),
    0
  );
});

const win = (pointsMade = 0): RankingInputs => ({
  wins: 1,
  mvpAwards: 0,
  fairPlayAwards: 0,
  pointsMade,
  assists: 0,
  fouls: 0
});

test("best-N ranking is identical to the full formula when games do not exceed N", () => {
  const games = [win(1), win(2), win(), win()];
  assert.equal(computeBestNRankingPoints(games, 4), computeRankingPoints(sumRankingInputs(games)));
  assert.equal(computeBestNRankingPoints(games.slice(0, 3), 4), computeRankingPoints(sumRankingInputs(games.slice(0, 3))));
});

test("best-N ranking drops a weak extra game and keeps a strong one", () => {
  const fourWins = [win(), win(), win(), win()];
  const withLoss = [
    ...fourWins,
    { wins: 0, mvpAwards: 0, fairPlayAwards: 0, pointsMade: 0, assists: 0, fouls: 0 }
  ];
  const withMvp = [
    ...fourWins,
    { wins: 1, mvpAwards: 1, fairPlayAwards: 0, pointsMade: 0, assists: 0, fouls: 0 }
  ];

  assert.equal(computeBestNRankingPoints(fourWins, 4), 24);
  assert.equal(computeBestNRankingPoints(withLoss, 4), 24);
  assert.equal(computeBestNRankingPoints(withMvp, 4), 27);
});

test("best-N ranking is zero with no games or a non-positive target", () => {
  assert.equal(computeBestNRankingPoints([], 4), 0);
  assert.equal(computeBestNRankingPoints([win()], 0), 0);
});
