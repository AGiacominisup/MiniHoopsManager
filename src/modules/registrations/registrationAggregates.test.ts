import assert from "node:assert/strict";
import test from "node:test";
import type { MatchDocument, MatchSide } from "../matches/match.model";
import type { MatchReportDocument } from "../matchReports/matchReport.model";
import { computeAggregates } from "./registrationAggregates.service";

const A = ["a1", "a2", "a3"];
const B = ["b1", "b2", "b3"];

type IdentifiedMatch = MatchDocument & { _id: unknown };

const buildMatch = (options: {
  id: string;
  scoreA: number;
  scoreB: number;
  sideOrder?: MatchSide[];
}): IdentifiedMatch => {
  const players = (ids: string[]) => ids.map((id) => ({ registrationId: id as never }));
  const teams = [
    { side: "A" as MatchSide, players: players(A) },
    { side: "B" as MatchSide, players: players(B) }
  ];

  return {
    _id: options.id,
    scoreA: options.scoreA,
    scoreB: options.scoreB,
    teams: (options.sideOrder ?? ["A", "B"]).map((side) =>
      teams.find((team) => team.side === side)
    )
  } as unknown as IdentifiedMatch;
};

const buildReport = (options: {
  matchId: string;
  lines: { registrationId: string; points?: number; assists?: number; fouls?: number }[];
  mvp?: string;
  fairPlay?: string;
}): MatchReportDocument =>
  ({
    matchId: options.matchId,
    boxScore: options.lines.map((line) => ({
      registrationId: line.registrationId,
      points: line.points ?? 0,
      assists: line.assists ?? 0,
      fouls: line.fouls ?? 0
    })),
    awards: {
      mvpRegistrationId: options.mvp ?? null,
      fairPlayRegistrationId: options.fairPlay ?? null
    }
  }) as unknown as MatchReportDocument;

const reportsFor = (...reports: MatchReportDocument[]) =>
  new Map(reports.map((report) => [String(report.matchId), report]));

test("credits the win to the side that actually scored more", () => {
  const match = buildMatch({ id: "m1", scoreA: 12, scoreB: 7 });

  const winner = computeAggregates("a1", [match], new Map(), 10);
  assert.deepEqual(winner, {
    matchesPlayed: 1,
    wins: 1,
    rankingPoints: 10,
    pointsScored: 12,
    pointsAllowed: 7,
    pointsMade: 0,
    assists: 0,
    fouls: 0,
    mvpAwards: 0,
    fairPlayAwards: 0
  });

  const loser = computeAggregates("b1", [match], new Map(), 10);
  assert.equal(loser.wins, 0);
  assert.equal(loser.rankingPoints, 0);
  assert.equal(loser.pointsScored, 7);
  assert.equal(loser.pointsAllowed, 12);
});

// The regression that matters: teams used to be read positionally, so a match
// stored as [B, A] credited the win to the wrong three players.
test("credits the win by side even when the teams are stored as [B, A]", () => {
  const match = buildMatch({ id: "m1", scoreA: 12, scoreB: 7, sideOrder: ["B", "A"] });

  assert.equal(computeAggregates("a1", [match], new Map(), 10).wins, 1);
  assert.equal(computeAggregates("a1", [match], new Map(), 10).pointsScored, 12);
  assert.equal(computeAggregates("b1", [match], new Map(), 10).wins, 0);
  assert.equal(computeAggregates("b1", [match], new Map(), 10).pointsScored, 7);
});

test("a corrected score moves wins and ranking points and leaves matchesPlayed alone", () => {
  const before = computeAggregates("a1", [buildMatch({ id: "m1", scoreA: 12, scoreB: 7 })], new Map(), 10);
  const after = computeAggregates("a1", [buildMatch({ id: "m1", scoreA: 7, scoreB: 12 })], new Map(), 10);

  assert.equal(before.wins, 1);
  assert.equal(after.wins, 0);
  assert.equal(before.rankingPoints, 10);
  assert.equal(after.rankingPoints, 0);
  assert.equal(before.matchesPlayed, after.matchesPlayed);
  assert.equal(after.pointsScored, 7);
  assert.equal(after.pointsAllowed, 12);
});

test("adds the individual numbers from the report and leaves the team numbers to the match", () => {
  const match = buildMatch({ id: "m1", scoreA: 12, scoreB: 7 });
  const report = buildReport({
    matchId: "m1",
    lines: [{ registrationId: "a1", points: 6, assists: 2, fouls: 1 }],
    mvp: "a1",
    fairPlay: "b2"
  });

  const scorer = computeAggregates("a1", [match], reportsFor(report), 10);
  assert.equal(scorer.pointsMade, 6);
  assert.equal(scorer.assists, 2);
  assert.equal(scorer.fouls, 1);
  assert.equal(scorer.mvpAwards, 1);
  assert.equal(scorer.fairPlayAwards, 0);
  // The team score stays what the match says, whatever the attribution.
  assert.equal(scorer.pointsScored, 12);

  const fairPlayer = computeAggregates("b2", [match], reportsFor(report), 10);
  assert.equal(fairPlayer.fairPlayAwards, 1);
  assert.equal(fairPlayer.pointsMade, 0);
});

test("a completed match without a report still counts for the standings", () => {
  const aggregates = computeAggregates(
    "a1",
    [buildMatch({ id: "m1", scoreA: 12, scoreB: 7 })],
    new Map(),
    10
  );

  assert.equal(aggregates.matchesPlayed, 1);
  assert.equal(aggregates.wins, 1);
  assert.equal(aggregates.pointsMade, 0);
});

test("sums across matches and ignores matches the player was not in", () => {
  const own = [
    buildMatch({ id: "m1", scoreA: 12, scoreB: 7 }),
    buildMatch({ id: "m2", scoreA: 5, scoreB: 9 })
  ];
  const foreign = {
    _id: "m3",
    scoreA: 10,
    scoreB: 2,
    teams: [
      { side: "A", players: [{ registrationId: "x1" }, { registrationId: "x2" }, { registrationId: "x3" }] },
      { side: "B", players: [{ registrationId: "y1" }, { registrationId: "y2" }, { registrationId: "y3" }] }
    ]
  } as unknown as IdentifiedMatch;

  const aggregates = computeAggregates("a1", [...own, foreign], new Map(), 10);

  assert.equal(aggregates.matchesPlayed, 2);
  assert.equal(aggregates.wins, 1);
  assert.equal(aggregates.rankingPoints, 10);
  assert.equal(aggregates.pointsScored, 17);
  assert.equal(aggregates.pointsAllowed, 16);
});

test("returns zeroes rather than negatives for a player with no completed match", () => {
  const aggregates = computeAggregates("a1", [], new Map(), 10);

  for (const value of Object.values(aggregates)) {
    assert.equal(value, 0);
  }
});
