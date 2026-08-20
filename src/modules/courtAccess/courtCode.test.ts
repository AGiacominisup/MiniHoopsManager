import assert from "node:assert/strict";
import test from "node:test";
import {
  COURT_CODE_LENGTH,
  formatCourtCode,
  generateCourtCode,
  hashCourtCode,
  normalizeCourtCode
} from "./courtCode";

test("generates codes of the configured length without ambiguous characters", () => {
  for (let index = 0; index < 200; index += 1) {
    const code = generateCourtCode();
    assert.equal(code.length, COURT_CODE_LENGTH);
    assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]+$/);
    assert.doesNotMatch(code, /[ILOU01]/);
  }
});

// A Math.random regression would show up as collisions long before this many.
test("generates distinct codes across many draws", () => {
  const codes = new Set<string>();
  for (let index = 0; index < 10000; index += 1) {
    codes.add(generateCourtCode());
  }

  assert.ok(codes.size > 9990, `expected near-unique codes, got ${codes.size}`);
});

test("normalizes the displayed form, separators and casing", () => {
  assert.equal(normalizeCourtCode("2345-6789"), "23456789");
  assert.equal(normalizeCourtCode("2345 6789"), "23456789");
  assert.equal(normalizeCourtCode("abcd2345"), "ABCD2345");
  assert.equal(normalizeCourtCode(" a-b c/d "), "ABCD");
});

test("formats a code for display in two groups", () => {
  assert.equal(formatCourtCode("23456789"), "2345-6789");
});

test("hashes deterministically and ignores the displayed separators", () => {
  const hash = hashCourtCode("23456789");

  assert.equal(hash, hashCourtCode("2345-6789"));
  assert.equal(hash, hashCourtCode("2345 6789"));
  assert.notEqual(hash, hashCourtCode("23456788"));
  // The plaintext must not be recoverable from what is stored.
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!hash.includes("23456789"));
});
