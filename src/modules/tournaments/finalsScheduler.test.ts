import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAYERS_PER_FINAL,
  buildFinalsPlan,
  compareFinalsRanking,
  evaluateFinalsReadiness,
  requiredFinalGroupCount,
  splitSextet,
  type FinalGroupRef,
  type RankedFinalsPlayer
} from "./finalsScheduler";

const player = (
  rankHint: number,
  overrides: Partial<RankedFinalsPlayer> = {}
): RankedFinalsPlayer => ({
  registrationId: `registration-${String(rankHint).padStart(2, "0")}`,
  jerseyNumber: rankHint,
  rankingPoints: 100 - rankHint,
  wins: 10 - Math.floor(rankHint / 3),
  pointsMade: 50 - rankHint,
  pointsScored: 80 - rankHint,
  pointsAllowed: rankHint,
  ...overrides
});

const players = (count: number): RankedFinalsPlayer[] =>
  Array.from({ length: count }, (_, index) => player(index + 1));

const groups = (count: number): FinalGroupRef[] =>
  ["Gold", "Silver", "Bronze", "Copper", "Iron", "Tin"].slice(0, count).map((themeName, index) => ({
    id: `group-${index + 1}`,
    themeName,
    level: index + 1
  }));

const idsOf = (team: { players: RankedFinalsPlayer[] }): string[] =>
  team.players.map((member) => member.registrationId);

test("required group count is ceil of roster size over six", () => {
  assert.equal(requiredFinalGroupCount(0), 0);
  assert.equal(requiredFinalGroupCount(6), 1);
  assert.equal(requiredFinalGroupCount(7), 2);
  assert.equal(requiredFinalGroupCount(12), 2);
  assert.equal(requiredFinalGroupCount(18), 3);
  assert.equal(requiredFinalGroupCount(19), 4);
  assert.equal(requiredFinalGroupCount(23), 4);
});

test("readiness reports every blocker the generate endpoint will enforce", () => {
  const ready = evaluateFinalsReadiness({
    status: "qualification",
    checkedInCount: 12,
    playersPerMatch: PLAYERS_PER_FINAL,
    hasEnabledCourt: true,
    finalGroups: groups(2),
    qualificationMatchCount: 8,
    completedQualificationCount: 8,
    reportedQualificationCount: 8
  });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);
  assert.equal(ready.requiredFinalGroups, 2);

  const blocked = evaluateFinalsReadiness({
    status: "draft",
    checkedInCount: 5,
    playersPerMatch: PLAYERS_PER_FINAL,
    hasEnabledCourt: false,
    finalGroups: groups(1),
    qualificationMatchCount: 3,
    completedQualificationCount: 2,
    reportedQualificationCount: 1
  });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.includes("Finals can only be generated after qualification has started"));
  assert.ok(blocked.blockers.includes("At least 6 checked-in players are required"));
  assert.ok(blocked.blockers.includes("At least one court must be enabled"));
  assert.ok(blocked.blockers.includes("All qualification matches must be completed"));
  assert.ok(blocked.blockers.includes("Every qualification match must have a submitted report"));
});

test("readiness requires a report on every qualification match even when all are completed", () => {
  const readiness = evaluateFinalsReadiness({
    status: "qualification",
    checkedInCount: 6,
    playersPerMatch: PLAYERS_PER_FINAL,
    hasEnabledCourt: true,
    finalGroups: groups(1),
    qualificationMatchCount: 4,
    completedQualificationCount: 4,
    reportedQualificationCount: 3
  });
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.blockers, ["Every qualification match must have a submitted report"]);
});

test("readiness requires enough uniquely numbered final groups", () => {
  const short = evaluateFinalsReadiness({
    status: "qualification",
    checkedInCount: 19,
    playersPerMatch: PLAYERS_PER_FINAL,
    hasEnabledCourt: true,
    finalGroups: groups(3),
    qualificationMatchCount: 13,
    completedQualificationCount: 13,
    reportedQualificationCount: 13
  });
  assert.equal(short.ready, false);
  assert.ok(short.blockers.includes("At least 4 final groups are required"));
  assert.equal(short.requiredFinalGroups, 4);

  const duplicate = evaluateFinalsReadiness({
    status: "qualification",
    checkedInCount: 12,
    playersPerMatch: PLAYERS_PER_FINAL,
    hasEnabledCourt: true,
    finalGroups: [
      { id: "a", themeName: "Gold", level: 1 },
      { id: "b", themeName: "Silver", level: 1 }
    ],
    qualificationMatchCount: 8,
    completedQualificationCount: 8,
    reportedQualificationCount: 8
  });
  assert.ok(duplicate.blockers.includes("finalGroups must have unique levels"));
});

test("split seats 1st 3rd 6th against 2nd 4th 5th", () => {
  const [teamA, teamB] = splitSextet(players(6));
  assert.deepEqual(idsOf(teamA), [
    "registration-01",
    "registration-03",
    "registration-06"
  ]);
  assert.deepEqual(idsOf(teamB), [
    "registration-02",
    "registration-04",
    "registration-05"
  ]);
});

test("six players produce one final and no extra match", () => {
  const plan = buildFinalsPlan(players(6), groups(1));
  assert.equal(plan.matches.length, 1);
  assert.equal(plan.matches[0].isExtra, false);
  assert.equal(plan.matches[0].finalGroupId, "group-1");
  assert.deepEqual(
    plan.assignments.map((assignment) => assignment.qualificationRank),
    [1, 2, 3, 4, 5, 6]
  );
  assert.ok(plan.assignments.every((assignment) => assignment.finalGroupId === "group-1"));
});

test("seven players add an extra match filled from the bottom of the first group", () => {
  const plan = buildFinalsPlan(players(7), groups(2));
  assert.equal(plan.matches.length, 2);
  assert.equal(plan.matches[0].isExtra, false);
  assert.equal(plan.matches[1].isExtra, true);
  assert.equal(plan.matches[1].finalGroupId, "group-2");

  const extraIds = plan.matches[1].teams.flatMap(idsOf);
  assert.deepEqual(extraIds.sort(), [
    "registration-02",
    "registration-03",
    "registration-04",
    "registration-05",
    "registration-06",
    "registration-07"
  ]);
  assert.deepEqual(idsOf(plan.matches[1].teams[0]), [
    "registration-02",
    "registration-04",
    "registration-07"
  ]);
  assert.deepEqual(idsOf(plan.matches[1].teams[1]), [
    "registration-03",
    "registration-05",
    "registration-06"
  ]);

  const primary = Object.fromEntries(
    plan.assignments.map((assignment) => [assignment.registrationId, assignment.finalGroupId])
  );
  assert.equal(primary["registration-01"], "group-1");
  assert.equal(primary["registration-06"], "group-1");
  assert.equal(primary["registration-07"], "group-2");
});

test("twelve players produce two full groups and no extra", () => {
  const plan = buildFinalsPlan(players(12), groups(2));
  assert.equal(plan.matches.length, 2);
  assert.ok(plan.matches.every((match) => match.isExtra === false));
  assert.deepEqual(idsOf(plan.matches[0].teams[0]), [
    "registration-01",
    "registration-03",
    "registration-06"
  ]);
  assert.deepEqual(idsOf(plan.matches[1].teams[0]), [
    "registration-07",
    "registration-09",
    "registration-12"
  ]);
});

test("eighteen players produce three full groups", () => {
  const plan = buildFinalsPlan(players(18), groups(3));
  assert.equal(plan.matches.length, 3);
  assert.ok(plan.matches.every((match) => match.isExtra === false));
  assert.equal(plan.matches[2].finalGroupId, "group-3");
  assert.equal(
    plan.assignments.filter((assignment) => assignment.finalGroupId === "group-3").length,
    6
  );
});

test("nineteen players add a copper extra filled from the bottom of bronze", () => {
  const plan = buildFinalsPlan(players(19), groups(4));
  assert.equal(plan.requiredFinalGroups, 4);
  assert.equal(plan.matches.length, 4);
  assert.equal(plan.matches[3].isExtra, true);
  assert.equal(plan.matches[3].finalGroupId, "group-4");

  const extraIds = plan.matches[3].teams.flatMap(idsOf);
  assert.deepEqual(extraIds.sort(), [
    "registration-14",
    "registration-15",
    "registration-16",
    "registration-17",
    "registration-18",
    "registration-19"
  ]);
  assert.deepEqual(idsOf(plan.matches[3].teams[0]), [
    "registration-14",
    "registration-16",
    "registration-19"
  ]);
  assert.deepEqual(idsOf(plan.matches[3].teams[1]), [
    "registration-15",
    "registration-17",
    "registration-18"
  ]);

  const bronze = plan.assignments.filter((assignment) => assignment.finalGroupId === "group-3");
  assert.equal(bronze.length, 6);
  assert.equal(plan.assignments.find((assignment) => assignment.registrationId === "registration-19")?.finalGroupId, "group-4");
  assert.equal(plan.assignments.find((assignment) => assignment.registrationId === "registration-14")?.finalGroupId, "group-3");
});

test("twenty-three players take one filler from the previous group", () => {
  const plan = buildFinalsPlan(players(23), groups(4));
  assert.equal(plan.matches.length, 4);
  const extraIds = plan.matches[3].teams.flatMap(idsOf);
  assert.deepEqual(extraIds.sort(), [
    "registration-18",
    "registration-19",
    "registration-20",
    "registration-21",
    "registration-22",
    "registration-23"
  ]);
});

test("ranking prefers rankingPoints then wins, pointsMade, differential, fewer conceded", () => {
  const weaker = player(1, {
    registrationId: "a",
    rankingPoints: 10,
    wins: 2,
    pointsMade: 8,
    pointsScored: 20,
    pointsAllowed: 10
  });
  const stronger = player(2, {
    registrationId: "b",
    rankingPoints: 12,
    wins: 1,
    pointsMade: 1,
    pointsScored: 5,
    pointsAllowed: 20
  });
  assert.ok(compareFinalsRanking(stronger, weaker) < 0);

  const equalPoints = [
    player(1, { registrationId: "late", rankingPoints: 10, wins: 1, pointsMade: 4, pointsScored: 10, pointsAllowed: 8 }),
    player(2, { registrationId: "early", rankingPoints: 10, wins: 1, pointsMade: 4, pointsScored: 10, pointsAllowed: 8 })
  ];
  const plan = buildFinalsPlan([...equalPoints, ...players(4).map((member, index) => ({
    ...member,
    registrationId: `pad-${index}`,
    rankingPoints: 0
  }))], groups(1));
  assert.equal(plan.assignments[0].registrationId, "early");
  assert.equal(plan.assignments[1].registrationId, "late");
});

test("refuses a roster smaller than six or too few final groups", () => {
  assert.throws(() => buildFinalsPlan(players(5), groups(1)), /At least 6/);
  assert.throws(() => buildFinalsPlan(players(19), groups(3)), /At least 4 final groups/);
});
