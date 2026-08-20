import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { correctMatchReportSchema, submitMatchReportSchema } from "./matchReport.validation";

const registrationId = "66b000000000000000000101";
const otherRegistrationId = "66b000000000000000000102";

const submitBody = (overrides: Record<string, unknown> = {}) => ({
  submissionId: randomUUID(),
  scoreA: 11,
  scoreB: 8,
  baskets: [],
  fouls: [],
  ...overrides
});

const messagesOf = (result: { success: false; error: { issues: { message: string }[] } }) =>
  result.error.issues.map((issue) => issue.message);

test("accepts a minimal report and defaults the optional collections", () => {
  const result = submitMatchReportSchema.safeParse({
    submissionId: randomUUID(),
    scoreA: 11,
    scoreB: 8
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data.baskets, []);
  assert.deepEqual(result.data.fouls, []);
  assert.deepEqual(result.data.awards, {});
});

test("rejects a draw with the message shared with the completion endpoint", () => {
  const result = submitMatchReportSchema.safeParse(submitBody({ scoreA: 9, scoreB: 9 }));

  assert.equal(result.success, false);
  assert.ok(
    messagesOf(result).includes("Draws are not supported in the current tournament format")
  );
});

test("rejects a basket worth anything other than 1 or 2 points", () => {
  for (const points of [0, 3, 1.5, -1]) {
    const result = submitMatchReportSchema.safeParse(
      submitBody({ baskets: [{ registrationId, points, clientSequence: 1 }] })
    );
    assert.equal(result.success, false, `points ${points} should be rejected`);
  }
});

test("rejects a duplicated clientSequence across baskets and fouls", () => {
  const result = submitMatchReportSchema.safeParse(
    submitBody({
      baskets: [{ registrationId, points: 2, clientSequence: 1 }],
      fouls: [{ registrationId: otherRegistrationId, clientSequence: 1 }]
    })
  );

  assert.equal(result.success, false);
  assert.ok(messagesOf(result).includes("clientSequence must be unique inside a report"));
});

test("rejects an assist credited to the scorer", () => {
  const result = submitMatchReportSchema.safeParse(
    submitBody({
      baskets: [
        { registrationId, points: 2, assistRegistrationId: registrationId, clientSequence: 1 }
      ]
    })
  );

  assert.equal(result.success, false);
  assert.ok(messagesOf(result).includes("An assist cannot be credited to the scorer"));
});

test("requires a UUID submissionId", () => {
  assert.equal(submitMatchReportSchema.safeParse(submitBody({ submissionId: "1" })).success, false);
  assert.equal(
    submitMatchReportSchema.safeParse(submitBody({ submissionId: undefined })).success,
    false
  );
});

test("caps the number of events a single report can carry", () => {
  const baskets = Array.from({ length: 201 }, (_unused, index) => ({
    registrationId,
    points: 1,
    clientSequence: index
  }));

  assert.equal(submitMatchReportSchema.safeParse(submitBody({ baskets })).success, false);
});

test("a correction requires a note and no submissionId", () => {
  assert.equal(
    correctMatchReportSchema.safeParse({ scoreA: 11, scoreB: 8 }).success,
    false
  );
  assert.equal(
    correctMatchReportSchema.safeParse({ scoreA: 11, scoreB: 8, note: "   " }).success,
    false
  );

  const result = correctMatchReportSchema.safeParse({
    scoreA: 11,
    scoreB: 8,
    note: "Wrong scorer on the last basket"
  });
  assert.equal(result.success, true);
});

test("a correction cannot introduce a draw either", () => {
  const result = correctMatchReportSchema.safeParse({ scoreA: 9, scoreB: 9, note: "typo" });

  assert.equal(result.success, false);
  assert.ok(
    messagesOf(result).includes("Draws are not supported in the current tournament format")
  );
});
