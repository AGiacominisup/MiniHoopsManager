export const PLAYERS_PER_FINAL = 6;

export interface RankedFinalsPlayer {
  registrationId: string;
  jerseyNumber?: string;
  name?: string;
  skillRating?: number;
  rankingPoints: number;
  wins: number;
  pointsMade: number;
  pointsScored: number;
  pointsAllowed: number;
}

export interface FinalGroupRef {
  id: string;
  themeName: string;
  level: number;
}

export interface FinalsTeam {
  side: "A" | "B";
  players: RankedFinalsPlayer[];
}

export interface FinalsMatchPlan {
  queuePosition: number;
  finalGroupId: string;
  isExtra: boolean;
  teams: [FinalsTeam, FinalsTeam];
}

export interface FinalsPlayerAssignment {
  registrationId: string;
  qualificationRank: number;
  finalGroupId: string;
}

export interface FinalsPlan {
  requiredFinalGroups: number;
  assignments: FinalsPlayerAssignment[];
  matches: FinalsMatchPlan[];
}

export interface FinalsReadinessInput {
  status: string;
  checkedInCount: number;
  playersPerMatch: number;
  hasEnabledCourt: boolean;
  finalGroups: FinalGroupRef[];
  qualificationMatchCount: number;
  completedQualificationCount: number;
  reportedQualificationCount: number;
}

export interface FinalsReadiness {
  ready: boolean;
  blockers: string[];
  requiredFinalGroups: number;
  checkedIn: number;
}

export const requiredFinalGroupCount = (checkedInCount: number, playersPerMatch = PLAYERS_PER_FINAL): number => {
  if (checkedInCount <= 0) {
    return 0;
  }
  return Math.ceil(checkedInCount / playersPerMatch);
};

/**
 * Qualification standing used to seat finals. Higher is better except
 * pointsAllowed (fewer conceded ranks higher) and registrationId (stable).
 */
export const compareFinalsRanking = (
  first: RankedFinalsPlayer,
  second: RankedFinalsPlayer
): number => {
  const firstDifferential = first.pointsScored - first.pointsAllowed;
  const secondDifferential = second.pointsScored - second.pointsAllowed;
  return (
    second.rankingPoints - first.rankingPoints ||
    second.wins - first.wins ||
    second.pointsMade - first.pointsMade ||
    secondDifferential - firstDifferential ||
    first.pointsAllowed - second.pointsAllowed ||
    first.registrationId.localeCompare(second.registrationId)
  );
};

export const evaluateFinalsReadiness = (input: FinalsReadinessInput): FinalsReadiness => {
  const blockers: string[] = [];
  const requiredFinalGroups = requiredFinalGroupCount(input.checkedInCount, input.playersPerMatch);

  if (input.status !== "qualification") {
    if (input.status === "finals" || input.status === "completed") {
      blockers.push("Finals have already been generated");
    } else {
      blockers.push("Finals can only be generated after qualification has started");
    }
  }

  if (input.checkedInCount < input.playersPerMatch) {
    blockers.push(`At least ${input.playersPerMatch} checked-in players are required`);
  }

  if (!input.hasEnabledCourt) {
    blockers.push("At least one court must be enabled");
  }

  if (input.qualificationMatchCount === 0) {
    blockers.push("Qualification matches have not been generated");
  } else {
    if (input.completedQualificationCount < input.qualificationMatchCount) {
      blockers.push("All qualification matches must be completed");
    }
    if (input.reportedQualificationCount < input.qualificationMatchCount) {
      blockers.push("Every qualification match must have a submitted report");
    }
  }

  const levels = input.finalGroups.map((group) => group.level);
  if (new Set(levels).size !== levels.length) {
    blockers.push("finalGroups must have unique levels");
  }

  if (input.checkedInCount >= input.playersPerMatch && input.finalGroups.length < requiredFinalGroups) {
    blockers.push(
      `At least ${requiredFinalGroups} final groups are required`
    );
  }

  return {
    ready: blockers.length === 0,
    blockers,
    requiredFinalGroups,
    checkedIn: input.checkedInCount
  };
};

const toSnapshot = (player: RankedFinalsPlayer): RankedFinalsPlayer => ({
  registrationId: player.registrationId,
  ...(player.jerseyNumber !== undefined && { jerseyNumber: player.jerseyNumber }),
  ...(player.name && { name: player.name }),
  ...(player.skillRating !== undefined && { skillRating: player.skillRating }),
  rankingPoints: player.rankingPoints,
  wins: player.wins,
  pointsMade: player.pointsMade,
  pointsScored: player.pointsScored,
  pointsAllowed: player.pointsAllowed
});

/**
 * Inside a ranked sestetto: 1st, 3rd, 6th vs 2nd, 4th, 5th.
 */
export const splitSextet = (
  players: RankedFinalsPlayer[]
): [FinalsTeam, FinalsTeam] => {
  if (players.length !== PLAYERS_PER_FINAL) {
    throw new Error("A final match requires exactly 6 players");
  }
  return [
    { side: "A", players: [players[0], players[2], players[5]].map(toSnapshot) },
    { side: "B", players: [players[1], players[3], players[4]].map(toSnapshot) }
  ];
};

export const buildFinalsPlan = (
  players: RankedFinalsPlayer[],
  finalGroups: FinalGroupRef[]
): FinalsPlan => {
  if (players.length < PLAYERS_PER_FINAL) {
    throw new Error(`At least ${PLAYERS_PER_FINAL} checked-in players are required`);
  }

  const uniqueIds = new Set(players.map((player) => player.registrationId));
  if (uniqueIds.size !== players.length) {
    throw new Error("Player registration IDs must be unique");
  }

  const levels = finalGroups.map((group) => group.level);
  if (new Set(levels).size !== levels.length) {
    throw new Error("finalGroups must have unique levels");
  }

  const required = requiredFinalGroupCount(players.length);
  const orderedGroups = [...finalGroups].sort((first, second) => first.level - second.level);
  if (orderedGroups.length < required) {
    throw new Error(`At least ${required} final groups are required`);
  }

  const usedGroups = orderedGroups.slice(0, required);
  const ranked = [...players].sort(compareFinalsRanking);
  const remainder = ranked.length % PLAYERS_PER_FINAL;
  const fullGroupCount = Math.floor(ranked.length / PLAYERS_PER_FINAL);

  const assignments: FinalsPlayerAssignment[] = ranked.map((player, index) => {
    const inRemainder = remainder !== 0 && index >= fullGroupCount * PLAYERS_PER_FINAL;
    const groupIndex = inRemainder ? required - 1 : Math.floor(index / PLAYERS_PER_FINAL);
    return {
      registrationId: player.registrationId,
      qualificationRank: index + 1,
      finalGroupId: usedGroups[groupIndex].id
    };
  });

  const matches: FinalsMatchPlan[] = [];
  for (let groupIndex = 0; groupIndex < fullGroupCount; groupIndex += 1) {
    const start = groupIndex * PLAYERS_PER_FINAL;
    const sextet = ranked.slice(start, start + PLAYERS_PER_FINAL);
    matches.push({
      queuePosition: groupIndex,
      finalGroupId: usedGroups[groupIndex].id,
      isExtra: false,
      teams: splitSextet(sextet)
    });
  }

  if (remainder !== 0) {
    const fillCount = PLAYERS_PER_FINAL - remainder;
    const previousGroup = ranked.slice(
      (fullGroupCount - 1) * PLAYERS_PER_FINAL,
      fullGroupCount * PLAYERS_PER_FINAL
    );
    const extraSextet = [...previousGroup.slice(-fillCount), ...ranked.slice(fullGroupCount * PLAYERS_PER_FINAL)];
    matches.push({
      queuePosition: fullGroupCount,
      finalGroupId: usedGroups[required - 1].id,
      isExtra: true,
      teams: splitSextet(extraSextet)
    });
  }

  return {
    requiredFinalGroups: required,
    assignments,
    matches
  };
};
