/**
 * Display identity used on registrations and match player snapshots.
 *
 * At least one of name or jersey number is required so a player can be
 * identified. When both exist they are both kept: parents may withhold a
 * child's name, and some tournaments play without numbered jerseys.
 */

export const playerDisplayName = (
  player?: { firstName?: string | null; lastName?: string | null } | null
): string | undefined => {
  const name = [player?.firstName, player?.lastName].filter(Boolean).join(" ");
  return name || undefined;
};

export const resolveJerseyNumber = (
  registrationJerseyNumber?: number | null,
  playerJerseyNumber?: number | null
): number | undefined => {
  const value = registrationJerseyNumber ?? playerJerseyNumber;
  if (value === undefined || value === null) {
    return undefined;
  }
  return value;
};

export const hasPlayerDisplayIdentity = (name?: string, jerseyNumber?: number): boolean =>
  Boolean(name) || jerseyNumber !== undefined;
