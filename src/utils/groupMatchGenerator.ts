/*
 * Core algorithm to generate unique groups with controlled appearances,
 * then derive round-robin matches inside each group.
 */

export type AppearanceTargets = Map<number, number>;

export interface AnalysisResult {
  balanced: boolean;
  totalSlots: number;
  extraNeeded: number;
  numGroups: number;
  message: string;
}

export interface TargetsResult {
  targets: AppearanceTargets;
  extraNeeded: number;
}

export interface VerifyResult {
  ok: boolean;
  counts: Map<number, number>;
  error?: string;
}

export interface BuildResult {
  groups: number[][];
  targets: AppearanceTargets;
  ok: boolean;
  counts: Map<number, number>;
}

export interface Match {
  groupIndex: number;
  home: number;
  away: number;
}

export interface BuildWithMatchesResult extends BuildResult {
  matches: Match[];
}

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let localK = Math.min(k, n - k);
  let result = 1;

  for (let i = 0; i < localK; i++) {
    result = (result * (n - i)) / (i + 1);
  }

  return Math.round(result);
}

function weightedSampleWithoutReplacement(
  population: number[],
  weights: number[],
  k: number
): number[] {
  const pool = [...population];
  const localWeights = [...weights];
  const result: number[] = [];

  for (let s = 0; s < k; s++) {
    const total = localWeights.reduce((a, b) => a + b, 0);
    let idx = 0;

    if (total <= 0) {
      idx = Math.floor(Math.random() * pool.length);
    } else {
      const randomValue = Math.random() * total;
      let cumulative = 0;
      idx = pool.length - 1;

      for (let i = 0; i < localWeights.length; i++) {
        cumulative += localWeights[i];
        if (randomValue <= cumulative) {
          idx = i;
          break;
        }
      }
    }

    result.push(pool[idx]);
    pool.splice(idx, 1);
    localWeights.splice(idx, 1);
  }

  return result;
}

export function analyzeInput(
  teamIds: number[],
  baseAppearances: number,
  groupSize = 6
): AnalysisResult {
  const n = teamIds.length;
  const totalSlots = n * baseAppearances;
  const remainder = totalSlots % groupSize;
  const extraNeeded = (groupSize - remainder) % groupSize;
  const numGroups = Math.ceil(totalSlots / groupSize);

  if (extraNeeded === 0) {
    return {
      balanced: true,
      totalSlots,
      extraNeeded: 0,
      numGroups,
      message: `No adjustment needed: ${numGroups} groups, each team appears exactly ${baseAppearances} times.`
    };
  }

  return {
    balanced: false,
    totalSlots,
    extraNeeded,
    numGroups,
    message:
      `n*r = ${totalSlots} is not divisible by ${groupSize}. ` +
      `You need ${extraNeeded} extra appearances to complete the last group (${numGroups} groups total). ` +
      `Provide at least ${extraNeeded} wildcard teams that can appear one extra time ` +
      `(if fewer are provided, some wildcard teams will appear more than once extra).`
  };
}

export function computeAppearanceTargets(
  teamIds: number[],
  baseAppearances: number,
  wildcardTeamIds: number[] = [],
  groupSize = 6
): TargetsResult {
  const teamSet = new Set(teamIds);
  const invalidWildcardIds = wildcardTeamIds.filter((x) => !teamSet.has(x));

  if (invalidWildcardIds.length > 0) {
    throw new Error(
      `These wildcard teams are not in the input set: ${invalidWildcardIds.sort((a, b) => a - b)}`
    );
  }

  const { extraNeeded } = analyzeInput(teamIds, baseAppearances, groupSize);
  const targets: AppearanceTargets = new Map(teamIds.map((x) => [x, baseAppearances]));

  if (extraNeeded > 0) {
    if (wildcardTeamIds.length === 0) {
      throw new Error(
        `Need ${extraNeeded} extra appearances but no wildcard teams were provided. ` +
          `Call analyzeInput() first to know how many are required.`
      );
    }

    for (let i = 0; i < extraNeeded; i++) {
      const teamId = wildcardTeamIds[i % wildcardTeamIds.length];
      targets.set(teamId, (targets.get(teamId) as number) + 1);
    }
  }

  return { targets, extraNeeded };
}

export function generateUniqueGroups(
  teamIds: number[],
  targets: AppearanceTargets,
  groupSize = 6,
  maxRestarts = 200,
  maxAttemptsPerGroup = 800
): number[][] {
  const n = teamIds.length;
  const totalSlots = teamIds.reduce((sum, x) => sum + (targets.get(x) as number), 0);

  if (totalSlots % groupSize !== 0) {
    throw new Error(`Target sum (${totalSlots}) is not divisible by ${groupSize}.`);
  }

  const numGroups = totalSlots / groupSize;
  const maxPossible = comb(n, groupSize);

  if (numGroups > maxPossible) {
    throw new Error(
      `Need ${numGroups} unique groups, but with n=${n} teams only ${maxPossible} combinations of size ${groupSize} exist.`
    );
  }

  for (let restart = 0; restart < maxRestarts; restart++) {
    const counts = new Map(teamIds.map((x) => [x, 0]));
    const usedGroups = new Set<string>();
    const groups: number[][] = [];
    let success = true;

    for (let g = 0; g < numGroups; g++) {
      let group: number[] | null = null;

      for (let attempt = 0; attempt < maxAttemptsPerGroup; attempt++) {
        const pool = teamIds.filter((x) => (counts.get(x) as number) < (targets.get(x) as number));
        if (pool.length < groupSize) {
          success = false;
          break;
        }

        const weights = pool.map((x) => (targets.get(x) as number) - (counts.get(x) as number) + 0.01);
        const candidate = weightedSampleWithoutReplacement(pool, weights, groupSize).sort((a, b) => a - b);
        const key = candidate.join(",");

        if (!usedGroups.has(key)) {
          group = candidate;
          usedGroups.add(key);
          break;
        }
      }

      if (group === null) {
        success = false;
        break;
      }

      groups.push(group);
      for (const x of group) {
        counts.set(x, (counts.get(x) as number) + 1);
      }
    }

    if (success && teamIds.every((x) => counts.get(x) === targets.get(x))) {
      return groups;
    }
  }

  throw new Error(
    "Could not generate a valid solution after multiple attempts. Try changing wildcard teams or reducing baseAppearances."
  );
}

export function verifyGroups(
  groups: number[][],
  teamIds: number[],
  targets: AppearanceTargets,
  groupSize = 6
): VerifyResult {
  const seen = new Set<string>();
  const counts = new Map<number, number>(teamIds.map((x) => [x, 0]));

  for (const group of groups) {
    if (group.length !== groupSize) {
      return { ok: false, counts, error: `Group has invalid size: ${group}` };
    }

    const key = [...group].sort((a, b) => a - b).join(",");
    if (seen.has(key)) {
      return { ok: false, counts, error: `Duplicate group found: ${key}` };
    }

    seen.add(key);

    for (const teamId of group) {
      counts.set(teamId, (counts.get(teamId) as number) + 1);
    }
  }

  const ok = teamIds.every((x) => counts.get(x) === targets.get(x));
  return { ok, counts };
}

export function generateMatchesFromGroups(groups: number[][]): Match[] {
  const matches: Match[] = [];

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        matches.push({
          groupIndex,
          home: group[i],
          away: group[j]
        });
      }
    }
  }

  return matches;
}

export function buildGroupsAndMatches(
  teamIds: number[],
  baseAppearances: number,
  wildcardTeamIds: number[] = [],
  groupSize = 6
): BuildWithMatchesResult {
  const { targets } = computeAppearanceTargets(
    teamIds,
    baseAppearances,
    wildcardTeamIds,
    groupSize
  );

  const groups = generateUniqueGroups(teamIds, targets, groupSize);
  const { ok, counts } = verifyGroups(groups, teamIds, targets, groupSize);
  const matches = generateMatchesFromGroups(groups);

  return { groups, targets, ok, counts, matches };
}
