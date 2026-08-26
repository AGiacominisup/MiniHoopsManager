import assert from "node:assert/strict";
import test from "node:test";
import { computeRankingPoints } from "./rankingFormula";

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
