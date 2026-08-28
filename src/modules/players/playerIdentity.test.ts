import assert from "node:assert/strict";
import test from "node:test";
import { jerseyNumberSchema } from "../../utils/validation";
import {
  hasPlayerDisplayIdentity,
  playerDisplayName,
  resolveJerseyNumber
} from "./playerIdentity";

test("builds a display name from first and last name", () => {
  assert.equal(playerDisplayName({ firstName: "Mario", lastName: "Rossi" }), "Mario Rossi");
  assert.equal(playerDisplayName({ firstName: "Mario" }), "Mario");
  assert.equal(playerDisplayName({ lastName: "Rossi" }), "Rossi");
  assert.equal(playerDisplayName({ firstName: "", lastName: "" }), undefined);
  assert.equal(playerDisplayName(undefined), undefined);
});

test("prefers the registration jersey number and falls back to the player", () => {
  assert.equal(resolveJerseyNumber("7", "12"), "7");
  assert.equal(resolveJerseyNumber(undefined, "12"), "12");
  assert.equal(resolveJerseyNumber(null, "12"), "12");
  assert.equal(resolveJerseyNumber("0", "12"), "0");
  assert.equal(resolveJerseyNumber("00", "12"), "00");
  assert.equal(resolveJerseyNumber(undefined, undefined), undefined);
  assert.equal(resolveJerseyNumber(0, 12), "0");
});

test("accepts name only, number only, or both, and rejects neither", () => {
  assert.equal(hasPlayerDisplayIdentity("Mario Rossi", undefined), true);
  assert.equal(hasPlayerDisplayIdentity(undefined, "12"), true);
  assert.equal(hasPlayerDisplayIdentity(undefined, "00"), true);
  assert.equal(hasPlayerDisplayIdentity("Mario Rossi", "12"), true);
  assert.equal(hasPlayerDisplayIdentity(undefined, undefined), false);
  assert.equal(hasPlayerDisplayIdentity(undefined, ""), false);
});

test("accepts 00 as a jersey number distinct from 0", () => {
  assert.equal(jerseyNumberSchema.parse("00"), "00");
  assert.equal(jerseyNumberSchema.parse("0"), "0");
  assert.equal(jerseyNumberSchema.parse(12), "12");
  assert.equal(jerseyNumberSchema.parse(undefined), undefined);
  assert.throws(() => jerseyNumberSchema.parse("000"));
  assert.throws(() => jerseyNumberSchema.parse("1a"));
});
