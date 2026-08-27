export interface QualificationPlayer {
  registrationId: string;
  jerseyNumber?: number;
  name?: string;
  /** Perceived strength, 0 to 10. Absent means DEFAULT_SKILL_RATING. */
  skillRating?: number;
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
  maxSkillDifference: number;
  averageSkillDifference: number;
  matchesOverSkillTolerance: number;
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
const MIN_SKILL_RATING = 0;
const MAX_SKILL_RATING = 10;
/** Players without a rating are treated as average, so a partially rated roster stays usable. */
const DEFAULT_SKILL_RATING = 5;
/**
 * Difference between the two team skill sums considered negligible: 4 points over
 * a trio is about 1.3 rating points per player. Within this band the teammate and
 * opponent variety constraints decide the partition alone.
 *
 * The value is tuned, not arbitrary. Measured over rosters of 6 to 40 players and
 * 1 to 6 appearances, the worst single-match imbalance drops from 24 points with
 * no balancing to 5, while the worst repeated-teammate count grows by at most one.
 * A tighter band (2) balances slightly better but doubles teammate repetition; a
 * looser one (5) stops correcting two-tier rosters, where every imbalance is a
 * multiple of the tier gap.
 */
const SKILL_TOLERANCE = 4;
/** Caps the contested-group enumeration in chooseGroup at C(10, 6) = 210 candidates. */
const CONTESTED_WINDOW = PLAYERS_PER_MATCH + 4;

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

const teamSkill = (team: string[], ratings: Map<string, number>): number =>
  team.reduce((sum, playerId) => sum + (ratings.get(playerId) ?? DEFAULT_SKILL_RATING), 0);

const skillDifference = (
  teamA: string[],
  teamB: string[],
  ratings: Map<string, number>
): number => Math.abs(teamSkill(teamA, ratings) - teamSkill(teamB, ratings));

/**
 * Splits the group in every possible way, ignoring history, and reports how even
 * the best of those splits is. Used to prefer groups of six that can actually be
 * balanced: a group of three strong and three weak players has no fair partition.
 */
const bestAchievableSkillDifference = (
  group: string[],
  ratings: Map<string, number>
): number => {
  const anchor = group[0];
  return Math.min(
    ...combinations(group.slice(1), TEAM_SIZE - 1).map((others) => {
      const teamA = [anchor, ...others];
      const teamASet = new Set(teamA);
      return skillDifference(
        teamA,
        group.filter((playerId) => !teamASet.has(playerId)),
        ratings
      );
    })
  );
};

const selectPartition = (
  group: string[],
  teammateCounts: Map<string, number>,
  opponentCounts: Map<string, number>,
  ratings: Map<string, number>,
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
    const difference = skillDifference(teamA, teamB, ratings);
    return {
      teamA,
      teamB,
      // Lexicographic: only the imbalance *beyond* tolerance outranks variety, so
      // an already fair match is still decided by teammate and opponent history.
      // The raw difference sits last and only separates otherwise equal splits.
      cost: [
        Math.max(0, difference - SKILL_TOLERANCE),
        Math.max(teammateA[0], teammateB[0]),
        teammateA[1] + teammateB[1],
        opponents[0],
        opponents[1],
        difference
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
  ratings: Map<string, number>,
  random: () => number
): { targets: Map<string, number>; extraAppearances: number } => {
  const totalRequested = playerIds.length * appearancesPerPlayer;
  const totalSlots = Math.ceil(totalRequested / PLAYERS_PER_MATCH) * PLAYERS_PER_MATCH;
  const extraAppearances = totalSlots - totalRequested;
  const targets = new Map(playerIds.map((playerId) => [playerId, appearancesPerPlayer]));

  // Shuffle first so equal ratings (including a fully unrated roster) stay
  // seed-random. The stable sort then puts the lowest ratings first without
  // disturbing that order among equals.
  const ordered = shuffled(playerIds, random).sort(
    (first, second) =>
      (ratings.get(first) ?? DEFAULT_SKILL_RATING) - (ratings.get(second) ?? DEFAULT_SKILL_RATING)
  );
  for (const playerId of ordered.slice(0, extraAppearances)) {
    targets.set(playerId, appearancesPerPlayer + 1);
  }
  return { targets, extraAppearances };
};

const chooseGroup = (
  playerIds: string[],
  remaining: Map<string, number>,
  previousGroup: Set<string>,
  teammateCounts: Map<string, number>,
  ratings: Map<string, number>,
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

  // Appearance fairness is a hard constraint, so skill may only reshuffle players
  // that are already interchangeable: those sharing the (remaining, consecutive)
  // key of the last player who made the cut. Everyone ranked strictly above them
  // is locked in, exactly as before.
  const boundary = candidates[PLAYERS_PER_MATCH - 1];
  const contestable = (candidate: (typeof candidates)[number]): boolean =>
    candidate.remaining === boundary.remaining && candidate.consecutive === boundary.consecutive;

  const locked = candidates
    .slice(0, candidates.findIndex(contestable))
    .map((candidate) => candidate.playerId);
  const contested = candidates.filter(contestable).map((candidate) => candidate.playerId);
  const slots = PLAYERS_PER_MATCH - locked.length;

  if (contested.length === slots) {
    return [...locked, ...contested];
  }

  // The window is already ordered by the seeded tie value, which bounds the
  // enumeration without biasing it.
  const window = contested.slice(0, CONTESTED_WINDOW);
  const groups = combinations(window, slots).map((combination) => {
    const group = [...locked, ...combination];
    const teammates = pairStats(group, teammateCounts);
    return {
      group,
      // Same tolerance band as selectPartition: only groups that cannot be split
      // fairly at all are penalised, and among the splittable ones the least
      // repetitive set of six wins. Ranking groups by raw skill difference here
      // instead would keep picking the same complementary sextets and collapse
      // teammate variety.
      cost: [
        Math.max(0, bestAchievableSkillDifference(group, ratings) - SKILL_TOLERANCE),
        teammates[0],
        teammates[1]
      ]
    };
  });

  groups.sort((first, second) => compareCost(first.cost, second.cost));
  const bestCost = groups[0].cost;
  const best = groups.filter((candidate) => compareCost(candidate.cost, bestCost) === 0);
  return best[Math.floor(random() * best.length)].group;
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
  if (
    players.some(
      (player) =>
        player.skillRating !== undefined &&
        (player.skillRating < MIN_SKILL_RATING || player.skillRating > MAX_SKILL_RATING)
    )
  ) {
    throw new Error(
      `Player skill ratings must be between ${MIN_SKILL_RATING} and ${MAX_SKILL_RATING}`
    );
  }

  const playerById = new Map(players.map((player) => [player.registrationId, player]));
  if (playerById.size !== players.length) {
    throw new Error("Player registration IDs must be unique");
  }

  const playerIds = [...playerById.keys()].sort();
  const ratings = new Map(
    players.map((player) => [player.registrationId, player.skillRating ?? DEFAULT_SKILL_RATING])
  );
  const random = createRandom(seed);
  const { targets, extraAppearances } = buildTargets(
    playerIds,
    appearancesPerPlayer,
    ratings,
    random
  );
  const remaining = new Map(targets);
  const teammateCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const matches: QualificationMatchPlan[] = [];
  const skillDifferences: number[] = [];
  let previousGroup = new Set<string>();
  const matchCount = [...targets.values()].reduce((sum, value) => sum + value, 0) / PLAYERS_PER_MATCH;

  for (let queuePosition = 0; queuePosition < matchCount; queuePosition += 1) {
    const group = chooseGroup(
      playerIds,
      remaining,
      previousGroup,
      teammateCounts,
      ratings,
      random
    );
    const partition = selectPartition(group, teammateCounts, opponentCounts, ratings, random);
    skillDifferences.push(skillDifference(partition.teamA, partition.teamB, ratings));
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
      maxOpponentPairCount: Math.max(0, ...opponentCounts.values()),
      maxSkillDifference: Math.max(0, ...skillDifferences),
      averageSkillDifference:
        Math.round(
          (skillDifferences.reduce((sum, value) => sum + value, 0) / skillDifferences.length) * 100
        ) / 100,
      matchesOverSkillTolerance: skillDifferences.filter((value) => value > SKILL_TOLERANCE).length
    }
  };
};