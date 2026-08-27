# Mini Hoops Manager — Qualification Game Generation & Ranking

## 1. Context

Mini Hoops Manager is a tournament management system designed for youth basketball tournaments.

The qualification phase is based on short 3v3 basketball games.

The main objective is to create a tournament structure that:

- allows every player to participate;
- gives players approximately the same number of games;
- creates balanced teams;
- continuously mixes players;
- avoids repeatedly pairing the same players;
- keeps the competitive element;
- produces a meaningful ranking used to create balanced final games.

The system must prioritize fairness and player experience over pure competitive ranking.

---

# 2. Qualification Game Format

Each qualification game is a 3v3 game.

Therefore:

- 6 players are required for each game;
- 3 players belong to Team A;
- 3 players belong to Team B.

Example:

```text
Game 1

Team A
- Player 1
- Player 2
- Player 3

Team B
- Player 4
- Player 5
- Player 6
```

Games are assigned to available courts.

A tournament can have one or more courts.

---

# 3. Player Rating

Each player has an initial `rating` value between 1 and 10.

Example:

```text
Player A → rating 8
Player B → rating 5
Player C → rating 3
```

The rating represents the player's estimated ability before the tournament starts.

## Important

The initial rating is a **static tournament input**.

It does not change during the tournament.

The rating must NOT be confused with the tournament ranking.

### Rating is used for:

- balancing teams;
- balancing games;
- determining priority for additional qualification games.

### Rating is NOT used for:

- directly determining the tournament winner;
- calculating the final tournament ranking;
- determining the final ranking position.

---

# 4. Tournament Ranking

The tournament ranking is a dynamic value generated from the player's performances during the qualification phase.

The ranking is based on the actual results and statistics recorded during games.

Conceptually:

```text
Initial Rating
      │
      ├── Team balancing
      ├── Game generation
      └── Extra game priority

Game Performance
      │
      └── Tournament Ranking
               │
               └── Final generation
```

The two values must remain completely independent.

---

# 5. Target Number of Games

When the tournament starts, the system must define a target number of qualification games per player.

Example:

```text
targetGames = 4
```

The goal is for every player to play at least 4 qualification games.

Ideally:

```text
Player A → 4 games
Player B → 4 games
Player C → 4 games
...
```

However, because each game requires exactly 6 players, the total number of required player/game assignments may not always be divisible by 6.

This creates the need for additional games.

---

# 6. Players with Additional Games

If the number of participants and the target number of games create an uneven distribution, some players must play one additional game.

Example:

```text
Players = 19
Players per game = 6
Target games per player = 4
```

The system must ensure that every player reaches the target number of games.

If additional player/game assignments are required, the extra games should be assigned according to the initial player rating.

## Priority rule

Players with the lowest initial rating have priority for additional games.

Example:

```text
Player A → rating 9
Player B → rating 8
Player C → rating 7
Player D → rating 6
Player E → rating 3
Player F → rating 2
```

If two additional game assignments are required:

```text
Player E → +1 game
Player F → +1 game
```

The tournament ranking must NOT be used to determine who receives the additional games.

This is intentional because the tournament ranking is continuously changing during the qualification phase.

---

# 7. Why Initial Rating Must Be Used

The tournament ranking is dynamic.

For example:

```text
Game 1
Player A → ranking score 15

Game 2
Player A → ranking score 21

Game 3
Player A → ranking score 27
```

Using the ranking to decide who should play additional games would create a feedback loop:

```text
Ranking
   ↓
Additional game assignment
   ↓
More games
   ↓
More statistics
   ↓
Ranking
```

This would make the scheduling logic dependent on the result of previous scheduling decisions.

Instead, the initial rating is stable and known before the tournament begins.

Therefore:

```text
Extra Game Priority = Initial Player Rating
```

---

# 8. Additional Games Must Not Distort the Ranking

Players who play an additional qualification game must not receive an unfair statistical advantage simply because they played more games.

Example:

```text
Target games = 4

Player A → 4 games
Player B → 5 games
```

If all 5 games of Player B were included in the ranking, Player B would have more opportunities to accumulate ranking points.

This would make the ranking statistically unfair.

Therefore, the ranking must use a fixed number of performances.

---

# 9. Best N Performances

The ranking must be calculated using the best `N` game performances.

Where:

```text
N = targetGames
```

Example:

```text
targetGames = 4
```

Player A:

```text
Game 1 → 18
Game 2 → 14
Game 3 → 21
Game 4 → 16
```

All four performances are considered.

Player B:

```text
Game 1 → 25
Game 2 → 20
Game 3 → 18
Game 4 → 15
Game 5 → 10
```

Only the best four performances are considered:

```text
25
20
18
15
```

The performance worth 10 points is excluded from the ranking calculation.

---

# 10. Ranking Score

The exact ranking formula must be implemented independently from the game scheduling algorithm.

The system should calculate a `GamePerformanceScore` for each player for each completed game.

Example:

```text
GamePerformance {
    gameId
    playerId
    score
}
```

Example:

```text
Player A

Game 1 → 18
Game 2 → 14
Game 3 → 21
Game 4 → 16
Game 5 → 12
```

If:

```text
targetGames = 4
```

the ranking uses:

```text
21
18
16
14
```

The ranking can then be calculated using the selected performances.

The implementation should keep the aggregation strategy configurable.

Possible strategies include:

```text
SUM
AVERAGE
WEIGHTED_AVERAGE
```

For the first implementation, `AVERAGE` is recommended because it keeps the ranking independent from the number of games played.

Example:

```text
21 + 18 + 16 + 14 = 69

69 / 4 = 17.25
```

Therefore:

```text
rankingScore = 17.25
```

---

# 11. Game Performance Score

The `GamePerformanceScore` should be calculated from the statistics recorded during each game.

The exact formula is a separate domain decision and must not be hard-coded into the scheduling algorithm.

Potential inputs may include:

- win/loss;
- points scored;
- points difference;
- individual points;
- assists;
- rebounds;
- other tournament statistics.

The ranking system should therefore operate on an abstract performance value:

```text
GamePerformanceScore
```

rather than directly depending on individual statistics.

This makes the ranking formula easier to evolve.

---

# 12. Team Generation

Each qualification game must contain exactly 6 players.

The 6 players must be divided into:

```text
Team A → 3 players
Team B → 3 players
```

The teams should be balanced according to the initial player rating.

Example:

```text
Players:

A → 9
B → 8
C → 7
D → 5
E → 4
F → 3
```

A possible balanced distribution:

```text
Team A
A (9)
D (5)
F (3)

Total = 17

Team B
B (8)
C (7)
E (4)

Total = 19
```

The algorithm should attempt to minimize the rating difference between the two teams.

---

# 13. Player Mixing

Team generation must not only focus on rating balance.

The system should also maximize player diversity.

The algorithm should attempt to avoid:

- repeatedly playing with the same teammates;
- repeatedly playing against the same opponents;
- generating identical team combinations;
- creating recurring player groups.

Example:

```text
Game 1

Team A
A
B
C

Team B
D
E
F
```

The next games should attempt to create different combinations:

```text
Game 2

Team A
A
D
E

Team B
B
C
F
```

and so on.

The goal is to maximize the number of different player interactions during the qualification phase.

---

# 14. Scheduling Constraints

The game generation algorithm must respect the following constraints.

## Mandatory constraints

1. Every game contains exactly 6 players.
2. Every team contains exactly 3 players.
3. A player cannot participate in two games at the same time.
4. Every player must reach the target number of games.
5. Additional games must be assigned when mathematically necessary.
6. Players with lower initial ratings have priority for additional games.
7. The same player should not repeatedly play with the same teammates.
8. Teams should be balanced according to initial rating.
9. The number of games played by each player should be as balanced as mathematically possible.

---

# 15. Courts

Games are not permanently associated with a court during the generation phase.

The system should generate a queue of games.

Example:

```text
Game Queue

1. Game 1
2. Game 2
3. Game 3
4. Game 4
5. Game 5
...
```

When a court becomes available, the next valid game can be assigned to it.

Example:

```text
Court 1 → Game 1
Court 2 → Game 2
```

When Court 1 becomes available:

```text
Court 1 → Game 3
```

---

# 16. Player Availability

A game cannot start if one or more assigned players are unavailable.

This can happen because a player may currently be playing on another court.

Example:

```text
Court 1 → Game 10
    Player A
    Player B
    Player C

Court 2 → Game 11
    Player D
    Player E
    Player F
```

If the next queued game contains Player A:

```text
Game 12
    Player A
    Player G
    Player H
    ...
```

Game 12 cannot start until Player A becomes available.

The scheduler should therefore select the next game that satisfies all availability constraints.

---

# 17. Game Queue vs Game Schedule

The system should distinguish between:

### Generated games

Games that have already been calculated by the tournament generation algorithm.

### Queued games

Generated games waiting to be assigned to a court.

### Active games

Games currently being played.

### Completed games

Games that have finished and produced results/statistics.

Possible state machine:

```text
GENERATED
    ↓
QUEUED
    ↓
ASSIGNED
    ↓
IN_PROGRESS
    ↓
COMPLETED
```

---

# 18. Tournament Flow

The overall tournament flow is:

```text
CREATE TOURNAMENT
        ↓
ADD / ASSIGN PLAYERS
        ↓
PLAYER CHECK-IN
        ↓
START TOURNAMENT
        ↓
CALCULATE TARGET GAMES
        ↓
IDENTIFY EXTRA GAME REQUIREMENTS
        ↓
ASSIGN EXTRA GAME PRIORITY
        ↓
GENERATE QUALIFICATION GAMES
        ↓
BALANCE TEAMS
        ↓
MAXIMIZE PLAYER DIVERSITY
        ↓
CREATE GAME QUEUE
        ↓
ASSIGN GAMES TO COURTS
        ↓
PLAY GAMES
        ↓
RECORD RESULTS & STATISTICS
        ↓
CALCULATE PLAYER PERFORMANCES
        ↓
CALCULATE QUALIFICATION RANKING
        ↓
GENERATE FINAL GROUPS
        ↓
PLAY FINALS
```

---

# 19. Separation of Responsibilities

The implementation must keep the following responsibilities separated.

## Player Rating

Responsible for:

```text
- initial player evaluation
- team balancing
- game balancing
- extra game priority
```

## Game Generator

Responsible for:

```text
- selecting players
- generating teams
- balancing teams
- maximizing diversity
- satisfying game-count constraints
```

## Game Scheduler

Responsible for:

```text
- game queue
- court assignment
- player availability
- game activation
```

## Game Management

Responsible for:

```text
- game state
- score
- fouls
- player statistics
- game completion
```

## Ranking Engine

Responsible for:

```text
- calculating game performance
- selecting best N performances
- calculating tournament ranking
```

These components should not be tightly coupled.

---

# 20. Recommended Domain Model

A tournament ranking entry could contain:

```typescript
interface TournamentPlayerRanking {
    tournamentId: string;
    playerId: string;

    initialRating: number;

    targetGames: number;
    gamesPlayed: number;

    performances: GamePerformance[];

    rankingScore: number;
}
```

A game performance could be:

```typescript
interface GamePerformance {
    gameId: string;
    playerId: string;

    performanceScore: number;

    statistics: GameStatistics;
}
```

---

# 21. Ranking Calculation

Conceptual algorithm:

```typescript
function calculateRankingScore(
    performances: GamePerformance[],
    targetGames: number
): number {

    const bestPerformances = performances
        .sort((a, b) => b.performanceScore - a.performanceScore)
        .slice(0, targetGames);

    if (bestPerformances.length === 0) {
        return 0;
    }

    const total = bestPerformances.reduce(
        (sum, performance) => sum + performance.performanceScore,
        0
    );

    return total / bestPerformances.length;
}
```

Important:

The implementation should not assume that the player has exactly `targetGames` performances.

A player may have:

```text
targetGames = 4
gamesPlayed = 5
```

In that case only the best four performances are used.

---

# 22. Extra Game Assignment

Extra game assignment should use the initial rating.

Conceptually:

```typescript
function selectPlayersForExtraGames(
    players: Player[],
    extraGameSlots: number
): Player[] {

    return players
        .sort((a, b) => a.rating - b.rating)
        .slice(0, extraGameSlots);
}
```

This is only the basic priority mechanism.

The actual scheduling algorithm must additionally verify:

- player availability;
- maximum additional games;
- current game assignment;
- player rest;
- game diversity;
- team balance.

The initial rating determines priority, but does not override hard scheduling constraints.

---

# 23. Fairness Principles

The qualification algorithm must optimize for fairness.

The primary goals are:

1. Equal number of games whenever mathematically possible.
2. Additional games assigned to lower-rated players.
3. Balanced teams.
4. Maximum player mixing.
5. Avoid repeated teammate combinations.
6. Avoid repeated opponent combinations.
7. Avoid player conflicts between simultaneous games.
8. Avoid unnecessary waiting time.
9. Preserve meaningful competition.

The system should never optimize only for ranking accuracy.

The tournament is designed primarily to provide every child with a balanced and meaningful playing experience.

---

# 24. Important Design Principle

The tournament ranking must never influence the generation of additional qualification games.

Correct:

```text
Initial Rating
      ↓
Extra Game Priority
```

Incorrect:

```text
Tournament Ranking
      ↓
Extra Game Priority
```

The ranking is the result of the qualification phase.

The rating is an input to the qualification phase.

---

# 25. Example

Assume:

```text
Players = 19
Target games = 4
Players per game = 6
```

Each player should play at least:

```text
4 games
```

The scheduler generates enough games to satisfy the target.

If additional player/game assignments are required, players are selected according to initial rating.

Example:

```text
Player A → rating 10
Player B → rating 9
Player C → rating 8
Player D → rating 7
Player E → rating 6
Player F → rating 5
Player G → rating 4
Player H → rating 3
Player I → rating 2
Player L → rating 1
```

If two players require an additional game:

```text
Player L → additional game
Player I → additional game
```

subject to the scheduling constraints.

Suppose Player L finishes with:

```text
Game 1 → 12
Game 2 → 18
Game 3 → 15
Game 4 → 20
Game 5 → 8
```

With:

```text
targetGames = 4
```

the ranking uses:

```text
20
18
15
12
```

and excludes:

```text
8
```

The additional game therefore gives Player L an additional opportunity to play, but does not give an automatic statistical advantage in the ranking.

---

# 26. Future Extensions

The architecture should allow future improvements such as:

- weighted performance scores;
- different tournament formats;
- different target game counts;
- different numbers of players per game;
- different court counts;
- player rest constraints;
- minimum time between games;
- advanced teammate diversity algorithms;
- opponent diversity algorithms;
- optimization algorithms;
- simulation of possible tournament schedules;
- real-time rescheduling;
- ranking snapshots;
- final group generation.

The initial implementation should therefore avoid hard-coding assumptions wherever possible.

---

# 27. Summary

Mini Hoops Manager uses two completely different concepts:

### Initial Rating

A value from 1 to 10 assigned before the tournament.

Used to:

```text
- balance teams
- balance games
- prioritize extra games
```

### Tournament Ranking

A dynamic value generated from actual game performances.

Used to:

```text
- rank players
- create balanced final groups
- determine final matchups
```

Players who play additional qualification games must not receive an unfair ranking advantage.

Therefore:

```text
Ranking Score =
best N Game Performances

where:

N = targetGames
```

The overall principle is:

> **Give lower-rated players additional opportunities to play, while keeping the ranking based on the same number of performances for every player.**

This preserves both fairness of participation and fairness of competition.
