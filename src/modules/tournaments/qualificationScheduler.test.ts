import assert from "node:assert/strict";
import test from "node:test";
import { buildQualificationPlan, type QualificationPlayer } from "./qualificationScheduler";

const players = (
  count: number,
  skillRating?: (index: number) => number
): QualificationPlayer[] =>
  Array.from({ length: count }, (_, index) => ({
    registrationId: `registration-${index + 1}`,
    jerseyNumber: String(index + 1),
    ...(skillRating && { skillRating: skillRating(index) })
  }));

const teamSkill = (team: { players: QualificationPlayer[] }): number =>
  team.players.reduce((sum, player) => sum + (player.skillRating ?? 5), 0);

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

test("assigns extra appearances to the lowest skill ratings", () => {
  // 7 × 2 = 14 slots, rounded up to 18, so four players get a third game.
  const roster = players(7, (index) => index);
  const plan = buildQualificationPlan(roster, 2, "lowest-rated-extras");

  const extraIds = Object.entries(plan.targets)
    .filter(([, appearances]) => appearances === 3)
    .map(([registrationId]) => registrationId)
    .sort();

  assert.deepEqual(extraIds, [
    "registration-1",
    "registration-2",
    "registration-3",
    "registration-4"
  ]);
});

test("breaks extra-appearance ties with the generation seed", () => {
  const roster = players(7, (index) => (index < 2 ? 0 : 8));
  const first = buildQualificationPlan(roster, 2, "tied-extras-a");
  const second = buildQualificationPlan(roster, 2, "tied-extras-b");

  const extraIds = (plan: typeof first) =>
    Object.entries(plan.targets)
      .filter(([, appearances]) => appearances === 3)
      .map(([registrationId]) => registrationId)
      .sort();

  const firstExtras = extraIds(first);
  const secondExtras = extraIds(second);

  assert.equal(first.metrics.extraAppearances, 4);
  assert.ok(firstExtras.includes("registration-1"));
  assert.ok(firstExtras.includes("registration-2"));
  assert.deepEqual(firstExtras, extraIds(buildQualificationPlan(roster, 2, "tied-extras-a")));
  assert.notDeepEqual(firstExtras, secondExtras);
});

test("produces a valid plan across realistic roster and appearance sizes", () => {
  for (let count = 6; count <= 40; count += 1) {
    for (let appearances = 1; appearances <= 6; appearances += 1) {
      // Ratings spread over the whole 0-10 range: the appearance guarantees below
      // are the proof that skill-aware group selection never trades away fairness.
      const plan = buildQualificationPlan(
        players(count, (index) => index % 11),
        appearances,
        `sweep-${count}-${appearances}`
      );
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

test("rejects skill ratings outside the 0 to 10 range", () => {
  assert.throws(
    () => buildQualificationPlan(players(6, (index) => (index === 3 ? 11 : 5)), 2, "too-high"),
    /between 0 and 10/
  );
  assert.throws(
    () => buildQualificationPlan(players(6, (index) => (index === 0 ? -1 : 5)), 2, "too-low"),
    /between 0 and 10/
  );
});

test("treats players without a skill rating as the average", () => {
  const unrated = buildQualificationPlan(players(12), 4, "unrated");
  const allAverage = buildQualificationPlan(players(12, () => 5), 4, "unrated");

  assert.equal(unrated.metrics.maxSkillDifference, 0);
  assert.equal(unrated.metrics.matchesOverSkillTolerance, 0);
  assert.deepEqual(
    unrated.matches.map((match) =>
      match.teams.map((team) => team.players.map((player) => player.registrationId))
    ),
    allAverage.matches.map((match) =>
      match.teams.map((team) => team.players.map((player) => player.registrationId))
    )
  );
});

test("splits a polarised group as evenly as the ratings allow", () => {
  // Three 10s and three 0s: the only possible trios are 20 vs 10, never better.
  const plan = buildQualificationPlan(players(6, (index) => (index < 3 ? 10 : 0)), 4, "polarised");

  assert.equal(plan.metrics.maxSkillDifference, 10);
  for (const match of plan.matches) {
    assert.equal(Math.abs(teamSkill(match.teams[0]) - teamSkill(match.teams[1])), 10);
  }
});

test("balances a two-tier roster exactly", () => {
  // The case the rating exists for: half the roster clearly stronger than the
  // other half. Every trio can be made 8+3+3 against 8+8+3, so the engine should
  // reach a perfect balance and pay nothing in teammate variety.
  const plan = buildQualificationPlan(
    players(12, (index) => (index % 2 === 0 ? 8 : 3)),
    4,
    "tiered-roster"
  );

  assert.equal(plan.metrics.maxSkillDifference, 0);
  assert.equal(plan.metrics.matchesOverSkillTolerance, 0);
  assert.equal(plan.metrics.maxTeammatePairCount, 2);
  for (const match of plan.matches) {
    assert.equal(teamSkill(match.teams[0]), teamSkill(match.teams[1]));
  }
});

test("keeps matches within tolerance on a fully spread roster", () => {
  // Ratings 0 to 10 with no clustering: the hardest input, since every group of
  // six contains extremes. Balancing costs some teammate variety here, and this
  // test pins how much.
  const rated = buildQualificationPlan(players(12, (index) => index % 11), 4, "spread-roster");
  const unrated = buildQualificationPlan(players(12), 4, "spread-roster");

  assert.equal(rated.metrics.matchesOverSkillTolerance, 0);
  assert.ok(rated.metrics.maxSkillDifference <= 4);
  assert.ok(rated.metrics.maxTeammatePairCount <= unrated.metrics.maxTeammatePairCount + 1);

  for (const match of rated.matches) {
    assert.ok(Math.abs(teamSkill(match.teams[0]) - teamSkill(match.teams[1])) <= 4);
  }
});