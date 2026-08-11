export interface QualificationPlayer {
  registrationId: string;
  jerseyNumber?: number;
  name?: string;
}

export interface QualificationTeam {
  side: "A" | "B";
  players: QualificationPlayer[];
}

export interface QualificationMatchPlan {
  queuePosition: number;
  teams: [QualificationTeam, QualificationTeam];
}

export interface QualificationMetrics {
  matches: number;
  extraAppearances: number;
  maxAppearanceDifference: number;
  maxTeammatePairCount: number;
  maxOpponentPairCount: number;
}

export interface QualificationPlan {
  seed: string;
  targets: Record<string, number>;
  matches: QualificationMatchPlan[];
  metrics: QualificationMetrics;
}

interface CandidatePartition {
  teamA: string[];
  teamB: string[];
  cost: number[];
}

const PLAYERS_PER_MATCH = 6;
const TEAM_SIZE = 3;

const hashSeed = (seed: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRandom = (seed: string): (() => number) => {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffled = <T>(values: T[], random: () => number): T[] => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const pairKey = (first: string, second: string): string =>
  first < second ? `${first}:${second}` : `${second}:${first}`;

const incrementPairs = (players: string[], counts: Map<string, number>): void => {
  for (let first = 0; first < players.length; first += 1) {
    for (let second = first + 1; second < players.length; second += 1) {
      const key = pairKey(players[first], players[second]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
};

const compareCost = (first: number[], second: number[]): number => {
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return first[index] - second[index];
    }
  }
  return 0;
};

const combinations = (values: string[], size: number): string[][] => {
  const result: string[][] = [];
  const visit = (start: number, selected: string[]): void => {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      selected.push(values[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return result;
};

const pairStats = (players: string[], counts: Map<string, number>): [number, number] => {
  const values: number[] = [];
  for (let first = 0; first < players.length; first += 1) {
    for (let second = first + 1; second < players.length; second += 1) {
      values.push(counts.get(pairKey(players[first], players[second])) ?? 0);
    }
  }
  return [Math.max(0, ...values), values.reduce((sum, value) => sum + value, 0)];
};

const opponentStats = (
  teamA: string[],
  teamB: string[],
  counts: Map<string, number>
): [number, number] => {
  const values = teamA.flatMap((first) =>
    teamB.map((second) => counts.get(pairKey(first, second)) ?? 0)
  );
  return [Math.max(0, ...values), values.reduce((sum, value) => sum + value, 0)];
};

const selectPartition = (
  group: string[],
  teammateCounts: Map<string, number>,
  opponentCounts: Map<string, number>,
  random: () => number
): CandidatePartition => {
  const anchor = group[0];
  const candidates = combinations(group.slice(1), TEAM_SIZE - 1).map((others) => {
    const teamA = [anchor, ...others];
    const teamASet = new Set(teamA);
    const teamB = group.filter((playerId) => !teamASet.has(playerId));
    const teammateA = pairStats(teamA, teammateCounts);
    const teammateB = pairStats(teamB, teammateCounts);
    const opponents = opponentStats(teamA, teamB, opponentCounts);
    return {
      teamA,
      teamB,
      cost: [
        Math.max(teammateA[0], teammateB[0]),
        teammateA[1] + teammateB[1],
        opponents[0],
        opponents[1]
      ]
    };
  });

  candidates.sort((first, second) => compareCost(first.cost, second.cost));
  const bestCost = candidates[0].cost;
  const best = candidates.filter((candidate) => compareCost(candidate.cost, bestCost) === 0);
  return best[Math.floor(random() * best.length)];
};

const buildTargets = (
  playerIds: string[],
  appearancesPerPlayer: number,
  random: () => number
): { targets: Map<string, number>; extraAppearances: number } => {
  const totalRequested = playerIds.length * appearancesPerPlayer;
  const totalSlots = Math.ceil(totalRequested / PLAYERS_PER_MATCH) * PLAYERS_PER_MATCH;
  const extraAppearances = totalSlots - totalRequested;
  const targets = new Map(playerIds.map((playerId) => [playerId, appearancesPerPlayer]));

  for (const playerId of shuffled(playerIds, random).slice(0, extraAppearances)) {
    targets.set(playerId, appearancesPerPlayer + 1);
  }
  return { targets, extraAppearances };
};

const chooseGroup = (
  playerIds: string[],
  remaining: Map<string, number>,
  previousGroup: Set<string>,
  random: () => number
): string[] => {
  const candidates = playerIds
    .filter((playerId) => (remaining.get(playerId) ?? 0) > 0)
    .map((playerId) => ({
      playerId,
      remaining: remaining.get(playerId) ?? 0,
      consecutive: previousGroup.has(playerId) ? 1 : 0,
      tie: random()
    }))
    .sort(
      (first, second) =>
        second.remaining - first.remaining ||
        first.consecutive - second.consecutive ||
        first.tie - second.tie
    );

  if (candidates.length < PLAYERS_PER_MATCH) {
    throw new Error("Could not build a complete 3vs3 match from the remaining appearance targets");
  }
  return candidates.slice(0, PLAYERS_PER_MATCH).map((candidate) => candidate.playerId);
};

export const buildQualificationPlan = (
  players: QualificationPlayer[],
  appearancesPerPlayer: number,
  seed: string
): QualificationPlan => {
  if (players.length < PLAYERS_PER_MATCH) {
    throw new Error("At least 6 checked-in players are required");
  }
  if (!Number.isInteger(appearancesPerPlayer) || appearancesPerPlayer < 1) {
    throw new Error("appearancesPerPlayer must be a positive integer");
  }
  if (!seed.trim()) {
    throw new Error("A non-empty generation seed is required");
  }

  const playerById = new Map(players.map((player) => [player.registrationId, player]));
  if (playerById.size !== players.length) {
    throw new Error("Player registration IDs must be unique");
  }

  const playerIds = [...playerById.keys()].sort();
  const random = createRandom(seed);
  const { targets, extraAppearances } = buildTargets(playerIds, appearancesPerPlayer, random);
  const remaining = new Map(targets);
  const teammateCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const matches: QualificationMatchPlan[] = [];
  let previousGroup = new Set<string>();
  const matchCount = [...targets.values()].reduce((sum, value) => sum + value, 0) / PLAYERS_PER_MATCH;

  for (let queuePosition = 0; queuePosition < matchCount; queuePosition += 1) {
    const group = chooseGroup(playerIds, remaining, previousGroup, random);
    const partition = selectPartition(group, teammateCounts, opponentCounts, random);
    incrementPairs(partition.teamA, teammateCounts);
    incrementPairs(partition.teamB, teammateCounts);
    for (const first of partition.teamA) {
      for (const second of partition.teamB) {
        const key = pairKey(first, second);
        opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
      }
    }
    for (const playerId of group) {
      remaining.set(playerId, (remaining.get(playerId) ?? 0) - 1);
    }
    previousGroup = new Set(group);
    matches.push({
      queuePosition,
      teams: [
        { side: "A", players: partition.teamA.map((id) => playerById.get(id) as QualificationPlayer) },
        { side: "B", players: partition.teamB.map((id) => playerById.get(id) as QualificationPlayer) }
      ]
    });
  }

  if ([...remaining.values()].some((value) => value !== 0)) {
    throw new Error("Generated plan does not satisfy all appearance targets");
  }

  const targetValues = [...targets.values()];
  return {
    seed,
    targets: Object.fromEntries(targets),
    matches,
    metrics: {
      matches: matchCount,
      extraAppearances,
      maxAppearanceDifference: Math.max(...targetValues) - Math.min(...targetValues),
      maxTeammatePairCount: Math.max(0, ...teammateCounts.values()),
      maxOpponentPairCount: Math.max(0, ...opponentCounts.values())
    }
  };
};