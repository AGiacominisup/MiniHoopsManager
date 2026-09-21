import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../../utils/ApiError";
import {
  DEFAULT_TARGET_SCORE,
  assertWinningScoreReachesTarget,
  targetScoreForPhase
} from "./matchTargetScore";

test("qualification uses the qualification target and finals use the finals target", () => {
  const tournament = { qualificationTargetScore: 15, finalsTargetScore: 8 };
  assert.equal(targetScoreForPhase(tournament, "qualification"), 15);
  assert.equal(targetScoreForPhase(tournament, "final"), 8);
});

test("falls back to the default when the tournament has no target yet", () => {
  assert.equal(targetScoreForPhase(undefined, "qualification"), DEFAULT_TARGET_SCORE);
  assert.equal(targetScoreForPhase({}, "final"), DEFAULT_TARGET_SCORE);
});

test("finals inherit the qualification target when they were not set", () => {
  assert.equal(targetScoreForPhase({ qualificationTargetScore: 21 }, "final"), 21);
});

test("accepts a winner that reaches or overshoots the target", () => {
  assert.doesNotThrow(() => assertWinningScoreReachesTarget(13, 11, 13));
  assert.doesNotThrow(() => assertWinningScoreReachesTarget(14, 12, 13));
});

test("refuses a winner that has not reached the target", () => {
  assert.throws(
    () => assertWinningScoreReachesTarget(12, 9, 13),
    (error: unknown) => error instanceof ApiError && error.statusCode === 400
  );
});
