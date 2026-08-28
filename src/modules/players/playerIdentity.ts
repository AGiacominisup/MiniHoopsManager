/**
 * Display identity used on registrations and match player snapshots.
 *
 * At least one of name or jersey number is required so a player can be
 * identified. When both exist they are both kept: parents may withhold a
 * child's name, and some tournaments play without numbered jerseys.
 *
 * Jersey numbers are strings so "00" is distinct from "0". Values still stored
 * as numbers in older documents are normalized on read.
 */

export type JerseyNumberInput = string | number | null | undefined;

export const normalizeJerseyNumber = (value?: JerseyNumberInput): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const asString = String(value).trim();
  return asString === "" ? undefined : asString;
};

export const playerDisplayName = (
  player?: { firstName?: string | null; lastName?: string | null } | null
): string | undefined => {
  const name = [player?.firstName, player?.lastName].filter(Boolean).join(" ");
  return name || undefined;
};

export const resolveJerseyNumber = (
  registrationJerseyNumber?: JerseyNumberInput,
  playerJerseyNumber?: JerseyNumberInput
): string | undefined =>
  normalizeJerseyNumber(registrationJerseyNumber) ?? normalizeJerseyNumber(playerJerseyNumber);

export const hasPlayerDisplayIdentity = (name?: string, jerseyNumber?: JerseyNumberInput): boolean =>
  Boolean(name) || normalizeJerseyNumber(jerseyNumber) !== undefined;
