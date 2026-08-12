import assert from "node:assert/strict";
import test from "node:test";
import { buildQualificationPlan, type QualificationPlayer } from "./qualificationScheduler";

const players = (count: number): QualificationPlayer[] =>
  Array.from({ length: count }, (_, index) => ({
    registrationId: `registration-${index + 1}`,
    jerseyNumber: index + 1
  }));

test("builds the same plan for the same seed", () => {
  const first = buildQualificationPlan(players(12), 4, "spring-2026");
  const second = buildQualificationPlan(players(12), 4, "spring-2026");
  assert.deepEqual(first, second);
});

test("builds valid rotating teams for exactly six players", () => {
  const plan = buildQualificationPlan(players(6), 4, "six-players");
  assert.equal(plan.matches.length, 4);
  assert.deepEqual(Object.values(plan.targets), [4, 4, 4, 4, 4, 4]);

  for (const match of plan.matches) {
    assert.equal(match.teams.length, 2);
    assert.equal(match.teams[0].players.length, 3);
    assert.equal(match.teams[1].players.length, 3);
    const ids = match.teams.flatMap((team) => team.players.map((player) => player.registrationId));
    assert.equal(new Set(ids).size, 6);
  }
  assert.ok(plan.metrics.maxTeammatePairCount <= 2);
});

test("balances extra appearances when requested slots are not divisible by six", () => {
  const plan = buildQualificationPlan(players(7), 2, "extra-slots");
  const targetValues = Object.values(plan.targets);
  assert.equal(plan.matches.length, 3);
  assert.equal(plan.metrics.extraAppearances, 4);
  assert.equal(Math.max(...targetValues) - Math.min(...targetValues), 1);

  const appearances = new Map<string, number>();
  for (const match of plan.matches) {
    for (const player of match.teams.flatMap((team) => team.players)) {
      appearances.set(player.registrationId, (appearances.get(player.registrationId) ?? 0) + 1);
    }
  }
  assert.deepEqual(Object.fromEntries(appearances), plan.targets);
});

test("produces a valid plan across realistic roster and appearance sizes", () => {
  for (let count = 6; count <= 40; count += 1) {
    for (let appearances = 1; appearances <= 6; appearances += 1) {
      const plan = buildQualificationPlan(players(count), appearances, `sweep-${count}-${appearances}`);
      const targetValues = Object.values(plan.targets);

      assert.ok(plan.metrics.maxAppearanceDifference <= 1);
      // The greedy allocator only stays feasible while no player needs more
      // appearances than there are matches; guard it for future custom targets.
      assert.ok(Math.max(...targetValues) <= targetValues.reduce((sum, value) => sum + value, 0) / 6);

      for (const match of plan.matches) {
        const ids = match.teams.flatMap((team) => team.players.map((player) => player.registrationId));
        assert.equal(match.teams[0].players.length, 3);
        assert.equal(match.teams[1].players.length, 3);
        assert.equal(new Set(ids).size, 6);
      }
    }
  }
});

test("rejects fewer than six players and duplicate registrations", () => {
  assert.throws(() => buildQualificationPlan(players(5), 3, "too-few"), /At least 6/);
  const duplicatePlayers = players(6);
  duplicatePlayers[5].registrationId = duplicatePlayers[0].registrationId;
  assert.throws(() => buildQualificationPlan(duplicatePlayers, 3, "duplicate"), /unique/);
});