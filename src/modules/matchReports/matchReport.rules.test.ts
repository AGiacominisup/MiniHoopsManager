import assert from "node:assert/strict";
import test from "node:test";
import type { MatchDocument, MatchSide } from "../matches/match.model";
import { ApiError } from "../../utils/ApiError";
import { UNATTRIBUTED_POINTS_WARNING, buildReportContent } from "./matchReport.rules";
import type { MatchReportBodyInput } from "./matchReport.validation";

const A = ["a1", "a2", "a3"];
const B = ["b1", "b2", "b3"];

const buildMatch = (sides: MatchSide[] = ["A", "B"]): MatchDocument => {
  const players = (ids: string[]) =>
    ids.map((id, index) => ({ registrationId: id as never, jerseyNumber: index + 1 }));
  const teams = [
    { side: "A" as MatchSide, players: players(A) },
    { side: "B" as MatchSide, players: players(B) }
  ];

  return {
    teams: sides.map((side) => teams.find((team) => team.side === side))
  } as unknown as MatchDocument;
};

const body = (overrides: Partial<MatchReportBodyInput> = {}): MatchReportBodyInput => ({
  scoreA: 4,
  scoreB: 2,
  baskets: [],
  fouls: [],
  awards: {},
  ...overrides
});

test("derives sides, the box score and the unattributed remainder", () => {
  const content = buildReportContent(
    buildMatch(),
    body({
      scoreA: 5,
      scoreB: 2,
      baskets: [
        { registrationId: "a1", points: 2, assistRegistrationId: "a2", clientSequence: 1 },
        { registrationId: "a1", points: 1, clientSequence: 2 },
        { registrationId: "b3", points: 2, clientSequence: 3 }
      ],
      fouls: [{ registrationId: "a2", clientSequence: 4 }]
    })
  );

  assert.deepEqual(
    content.baskets.map((basket) => basket.side),
    ["A", "A", "B"]
  );

  const a1 = content.boxScore.find((line) => line.registrationId === "a1");
  assert.deepEqual(a1, {
    registrationId: "a1",
    side: "A",
    points: 3,
    onePointers: 1,
    twoPointers: 1,
    assists: 0,
    fouls: 0
  });

  const a2 = content.boxScore.find((line) => line.registrationId === "a2");
  assert.equal(a2?.assists, 1);
  assert.equal(a2?.fouls, 1);

  assert.equal(content.boxScore.length, 6);
  // 5 reported, 3 attributed on side A.
  assert.equal(content.unattributedPointsA, 2);
  assert.equal(content.unattributedPointsB, 0);
  assert.deepEqual(content.warnings, [UNATTRIBUTED_POINTS_WARNING]);
});

test("reports no warning when every point is attributed", () => {
  const content = buildReportContent(
    buildMatch(),
    body({
      scoreA: 2,
      scoreB: 1,
      baskets: [
        { registrationId: "a1", points: 2, clientSequence: 1 },
        { registrationId: "b1", points: 1, clientSequence: 2 }
      ]
    })
  );

  assert.equal(content.unattributedPointsA, 0);
  assert.equal(content.unattributedPointsB, 0);
  assert.deepEqual(content.warnings, []);
});

test("rejects more attributed points than the reported score", () => {
  assert.throws(
    () =>
      buildReportContent(
        buildMatch(),
        body({
          scoreA: 2,
          scoreB: 1,
          baskets: [
            { registrationId: "a1", points: 2, clientSequence: 1 },
            { registrationId: "a2", points: 2, clientSequence: 2 },
            { registrationId: "b1", points: 1, clientSequence: 3 }
          ]
        })
      ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      error.message === "Attributed points exceed the reported score for side A"
  );
});

test("rejects a player who is not in the match", () => {
  assert.throws(
    () =>
      buildReportContent(
        buildMatch(),
        body({ baskets: [{ registrationId: "outsider", points: 2, clientSequence: 1 }] })
      ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      error.message.includes("is not part of this match")
  );
});

test("rejects an assist credited to an opponent", () => {
  assert.throws(
    () =>
      buildReportContent(
        buildMatch(),
        body({
          baskets: [
            { registrationId: "a1", points: 2, assistRegistrationId: "b1", clientSequence: 1 }
          ]
        })
      ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      error.message === "An assist must be credited to a teammate of the scorer"
  );
});

test("rejects awards given to a player outside the match", () => {
  assert.throws(
    () => buildReportContent(buildMatch(), body({ awards: { mvpRegistrationId: "outsider" } })),
    (error: unknown) =>
      error instanceof ApiError && error.message === "MVP must be a player of this match"
  );
  assert.throws(
    () =>
      buildReportContent(buildMatch(), body({ awards: { fairPlayRegistrationId: "outsider" } })),
    (error: unknown) =>
      error instanceof ApiError &&
      error.message === "Fair play award must be a player of this match"
  );
});

test("accepts the same player as MVP and fair play, and a scoreless MVP", () => {
  const content = buildReportContent(
    buildMatch(),
    body({ awards: { mvpRegistrationId: "b2", fairPlayRegistrationId: "b2" } })
  );

  assert.equal(content.awards.mvpRegistrationId, "b2");
  assert.equal(content.awards.fairPlayRegistrationId, "b2");
});

// The teams array used to be readable in either order, and the box score is
// side-keyed, so a [B, A] match must still attribute to the right side.
test("derives the side from the team, not from the array position", () => {
  const content = buildReportContent(
    buildMatch(["B", "A"]),
    body({
      scoreA: 2,
      scoreB: 1,
      baskets: [
        { registrationId: "a1", points: 2, clientSequence: 1 },
        { registrationId: "b1", points: 1, clientSequence: 2 }
      ]
    })
  );

  assert.equal(content.baskets[0].side, "A");
  assert.equal(content.baskets[1].side, "B");
  assert.equal(content.unattributedPointsA, 0);
  assert.equal(content.unattributedPointsB, 0);
});
