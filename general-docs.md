# Mini Hoops Manager
## Tournament Engine — Technical Design Document

**Status:** Draft  
**Scope:** Backend / Tournament Engine  
**Database:** MongoDB  
**API:** REST  
**Game format:** 3 vs 3  
**Players per game:** 6  

---

# 1. Purpose

This document describes the technical architecture and domain rules for the tournament engine of **Mini Hoops Manager**.

The purpose of the engine is to automatically manage the competitive phase of a minibasket tournament, from the creation of games to the assignment of players and courts, while respecting the core principles of the Mini Hoops Manager format:

- every registered player must participate;
- players should play approximately the same number of games;
- teams must change continuously;
- repeated player combinations should be minimized;
- games should be distributed across available courts;
- competition should remain balanced;
- when an equal number of games is mathematically impossible, additional games should be assigned according to the tournament ranking.

The tournament engine is therefore not simply a scheduler.

It is a **constraint-based player and game allocation system**.

---

# 2. Existing Backend

The backend infrastructure is already available.

## 2.1 Technology

- MongoDB
- REST APIs
- Existing CRUD services
- Tournament management
- Player management
- Initial dashboard

## 2.2 Existing domain entities

The current backend already supports the main entities required for the first version of the system:

- Tournament
- Player
- Registration — the Player↔Tournament join entity
- Match
- Dashboard data

**Registration** is the central entity of the participation model. A Player is a global,
tournament-independent record; a Registration links that Player to one Tournament and carries
everything that is specific to that participation: attendance status, jersey number, and the
running tournament statistics (`rankingPoints`, `matchesPlayed`, `wins`, `pointsScored`,
`pointsAllowed`, `finalGroupId`).

The scheduling engine works exclusively in **registration-ID space**, never in player-ID space.

The existing CRUD APIs allow the frontend or other clients to:

- create tournaments;
- retrieve tournaments;
- update tournaments;
- retrieve players;
- create players;
- manage tournament participants;
- retrieve initial tournament information.

The tournament engine will build on top of this existing infrastructure.

---

# 3. Tournament Concept

A tournament consists of a fixed set of players.

The set of players participating in a tournament is defined when the tournament is created or finalized.

Once the tournament starts, the participant set should be considered fixed for the purpose of generating the tournament schedule.

The fundamental rule is:

> **Every player participating in a tournament must play approximately the same number of games.**

The exact number depends on:

- number of registered players;
- number of available courts;
- number of games configured for the tournament;
- maximum number of games per player;
- 6-player requirement for each 3v3 game.

---

# 4. Game Format

Mini Hoops Manager uses a 3 vs 3 format.

Each game requires exactly:

**6 players**

distributed into:

- Team A → 3 players
- Team B → 3 players

A game is therefore the fundamental unit used by the tournament engine.

A game contains:

```text
Game
 ├── Tournament
 ├── Court
 ├── Team A
 │    ├── Player
 │    ├── Player
 │    └── Player
 ├── Team B
 │    ├── Player
 │    ├── Player
 │    └── Player
 ├── Score
 ├── Status
 └── Result
```

---

# 5. Courts

A tournament may have one or more courts available.

A player cannot participate in two games taking place at the same time.

The engine does **not** solve this with a fixed round structure. Real minibasket games do not end
on schedule, so any pre-computed timetable drifts within the first hour of play.

Instead, generation produces an **ordered queue** of games. Every generated game is persisted with
`courtId: null` and a `queuePosition`, and is bound to a court only at run time, when that court
becomes free:

```text
POST /tournaments/{id}/courts/{courtId}/assign-next
```

Assignment walks the queue in order and reserves the first game whose six players are not already
busy in a `ready` or `in_progress` game. Player overlap is therefore prevented at assignment time
rather than at generation time, and it holds by construction no matter how long games actually run.

Among the eligible candidates the engine prefers those with the fewest players from the game that
just finished, so players get a break before playing again.

Completing a game automatically reserves the next compatible game on the freed court, without
starting it.

---

# 6. Dynamic Team Generation

One of the fundamental characteristics of Mini Hoops Manager is that teams are not fixed.

Players register individually.

Teams are generated dynamically for every game.

Example:

```text
Game 1

Team A
Player 1
Player 2
Player 3

Team B
Player 4
Player 5
Player 6
```

The next game should preferably use a different combination:

```text
Game 2

Team A
Player 1
Player 4
Player 5

Team B
Player 2
Player 3
Player 6
```

The objective is to maximize the diversity of player combinations throughout the tournament.

---

# 7. Player Diversity

The team generation algorithm should avoid repeatedly pairing the same players.

The ideal situation is that, throughout the tournament, every player has the opportunity to:

- play with different teammates;
- play against different opponents;
- interact with different players;
- experience different team combinations.

The algorithm should therefore track historical player combinations.

At minimum, the system should be able to determine:

```text
How many times did Player A play with Player B?
```

and:

```text
How many times did Player A play against Player B?
```

These values can be used as penalties during future game generation.

For example:

```text
Pairing A + B → penalty 0
Pairing A + C → penalty 1
Pairing A + D → penalty 3
```

The engine should prefer combinations with lower historical penalties.

---

# 8. Number of Games per Player

The tournament engine must distribute games as evenly as mathematically possible.

For a tournament with `N` players, each game requires 6 player slots.

The total number of player participations is therefore:

```text
totalPlayerSlots = games × 6
```

The ideal number of games per player is:

```text
idealGames = totalPlayerSlots / N
```

If this value is an integer, every player can play exactly the same number of games.

If it is not an integer, the distribution must be as balanced as possible.

Example:

```text
18 players
6 games

6 × 6 = 36 player slots

36 / 18 = 2

Every player plays exactly 2 games.
```

Another example:

```text
19 players
13 games

13 × 6 = 78 player slots

78 / 19 = 4 remainder 2
```

The distribution should therefore be:

```text
17 players → 4 games
2 players  → 5 games
```

The difference between the minimum and maximum number of games should never exceed 1 unless there is an explicit tournament configuration that requires otherwise.

---

# 9. Additional Game Allocation

When the number of available player slots cannot be divided equally among all players, some players must play one additional game.

Mini Hoops Manager introduces an important domain rule:

> **Additional games should preferentially be assigned to players with the lowest ranking.**

The rationale is to give players with fewer points additional opportunities to improve their ranking before the final stage.

Example:

```text
Players requiring an additional game:

Player A → ranking 32
Player B → ranking 28
Player C → ranking 24
Player D → ranking 19
Player E → ranking 12
```

The engine should prioritize the players with the lowest ranking when selecting who receives the additional game.

However, ranking is not the only constraint.

A player can only be selected if the assignment is compatible with:

- court availability;
- current round;
- previous game participation;
- maximum games;
- player combination diversity;
- other tournament constraints.

Therefore, ranking should be considered a **priority factor**, not an absolute rule that can violate hard constraints.

> **Implementation status:** not yet active. The engine currently distributes the additional
> appearances uniformly at random across the roster, using the generation seed. Ranking-driven
> allocation is Phase 2 (§20) and requires the ranking system to exist first — at generation time
> every player still has zero ranking points, so this rule only becomes meaningful once games are
> generated in stages rather than all at once.

---

# 10. Hard Constraints vs Soft Constraints

The algorithm should explicitly distinguish between **hard constraints** and **soft constraints**.

## Hard constraints

These rules must never be violated.

Examples:

1. A game must contain exactly 6 players.
2. A team must contain exactly 3 players.
3. A player cannot play two games at the same time.
4. A player cannot be assigned to two courts in the same time slot.
5. A player cannot exceed the configured maximum number of games.
6. Every scheduled game must have a valid court.
7. Every participant must be considered in the game allocation process.

## Soft constraints

These rules should be optimized but may be violated when mathematically necessary.

Examples:

1. Avoid repeating teammates.
2. Avoid repeating opponents.
3. Keep games balanced.
4. Prefer players with lower ranking for additional games.
5. Minimize differences in number of games played.
6. Maximize diversity of combinations.
7. Avoid repeating the same team composition.

This distinction is extremely important for the implementation.

The algorithm should never sacrifice a hard constraint to satisfy a soft constraint.

---

# 11. Candidate Game Generation

The engine should not simply generate completely random teams.

Instead, it should generate candidate combinations and evaluate them.

Conceptually:

```text
Generate candidates
        ↓
Validate hard constraints
        ↓
Calculate score
        ↓
Compare candidates
        ↓
Select best candidate
        ↓
Persist game
        ↓
Update player history
```

Each candidate game can receive a score based on multiple factors.

Example:

```text
Candidate Score =

+ Team Diversity
+ Opponent Diversity
+ Ranking Balance
+ Game Distribution Balance
- Repeated Teammate Penalty
- Repeated Opponent Penalty
- Unequal Game Count Penalty
```

The exact weighting of these factors should be configurable.

---

# 12. Player Ranking

Each tournament maintains an individual ranking.

The ranking belongs to the player within the context of the tournament.

A player therefore has:

```text
Global Player
       ↓
Tournament Participation
       ↓
Tournament Ranking
```

The ranking should not be considered a permanent player skill rating.

It represents the player's performance during the current tournament.

The exact scoring system is still to be defined.

Possible factors include:

- wins;
- losses;
- points scored;
- point differential;
- games played;
- individual performance;
- other tournament-specific metrics.

The ranking system should be implemented independently from the game generation algorithm so that it can evolve without requiring a rewrite of the scheduling engine.

---

# 13. Game Entity

A game represents one scheduled 3v3 match.

A conceptual model is:

```text
Game
{
    id
    tournamentId
    round
    courtId

    teamA: [
        playerId,
        playerId,
        playerId
    ]

    teamB: [
        playerId,
        playerId,
        playerId
    ]

    score: {
        teamA,
        teamB
    }

    status

    startedAt
    completedAt

    result
}
```

The exact MongoDB schema should follow the conventions already established in the project.

---

# 14. Game Lifecycle

A game has an explicit lifecycle.

Generated qualification games start in `queued` and never carry a scheduled time:

```text
queued → ready → in_progress → completed
```

- `queued` — in the plan, not yet bound to a court;
- `ready` — reserved on a specific court, waiting for an explicit Start;
- `in_progress` — being played;
- `completed` — final score recorded.

`scheduled` exists for manually created games that do have a planned time. It is not used by the
generator.

A completed game generates the data required to update the tournament ranking.

The score entry should therefore trigger the appropriate ranking recalculation/update process.

---

# 15. Tournament Lifecycle

The lifecycle is expressed with **two independent axes** rather than a single state machine.

```text
Tournament.status              planned → in_progress → completed
Tournament.qualification.status  draft → generated → in_progress → completed
```

`status` describes the event as a whole. `qualification.status` describes the competitive phase and
is what actually gates the engine.

### draft

Players can be added, removed, checked in and withdrawn. Courts and tournament configuration are
still editable. This is the phase the document previously called *Registration*.

### generated

The plan exists as a queue of games. The **roster, courts and configuration are locked** — every
registration mutation returns `409`. The plan can still be discarded entirely with
`DELETE /tournaments/{id}/qualification`, which removes every qualification game and returns the
tournament to `draft`.

### in_progress

At least one game has been completed. Regeneration is no longer possible, which protects historical
results and player statistics.

### completed

No qualification game is left queued, ready or in progress. `Tournament.status` is moved to
`completed` at the same time.

Finals are not yet implemented. `finalGroups` and `Registration.finalGroupId` already exist as the
data model for that phase, but no finals generator is wired up.

---

# 16. Tournament Generation

Generation is a distinct, two-step operation: an idempotent **preview** followed by an explicit
**commit**.

```http
POST /tournaments/{tournamentId}/qualification/preview
POST /tournaments/{tournamentId}/qualification/generate
```

`preview` is pure: it computes a plan and persists nothing. It returns the plan, its quality
metrics, the `seed` used, and a `rosterFingerprint` — a SHA-256 hash of the sorted registration IDs
plus the tournament configuration.

`generate` takes that `seed` and `rosterFingerprint` back. The seed makes the plan reproducible;
the fingerprint makes the commit safe, because it fails if the roster or configuration changed
after the preview the operator actually reviewed.

The operation:

1. validates the tournament and returns any readiness blocker (at least `playersPerMatch`
   checked-in players, at least one enabled court, qualification still in `draft`);
2. calculates target appearances per player;
3. identifies players receiving an additional appearance;
4. generates and scores candidate team splits;
5. persists the games as an ordered queue, with no court assigned;
6. locks the roster by moving `qualification.status` to `generated`;
7. returns the generated schedule.

Steps 5 and 6 run inside a single MongoDB transaction, and the roster is re-read and
re-fingerprinted **inside** that transaction — the roster lock only engages once the tournament
leaves `draft`, so a read taken before the transaction is not authoritative.

Only **checked-in** players enter the plan. Courts are validated at generation time but assigned at
run time (see §5).

`generate` is idempotent: replaying it with the same `seed` and `rosterFingerprint` returns the
already-persisted schedule with `200` instead of creating a second one. The idempotent reply is
produced before any roster re-validation, so a retry cannot fail because of changes that happened
after the original generation succeeded.

---

# 17. Regeneration

The system should consider tournament generation as a potentially repeatable operation before the tournament begins.

For example:

```text
Generate Tournament
        ↓
Review Schedule
        ↓
Regenerate
        ↓
Review Schedule
        ↓
Confirm Tournament
```

Once games have started, automatic regeneration should no longer be allowed without an explicit administrative action.

This avoids invalidating historical game data and player statistics.

---

# 18. Frontend Requirements

The generated data must be consumable by the frontend.

The frontend will need to display at least:

### Tournament

- tournament information;
- participant count;
- number of courts;
- tournament status;
- current phase.

### Schedule

- games;
- rounds;
- courts;
- participating players;
- game status.

### Player

- games played;
- wins/losses;
- ranking;
- points;
- teammates;
- opponents.

### Results

- game score;
- winner;
- ranking updates.

The backend should expose APIs that allow the frontend to retrieve the tournament state without having to reproduce any tournament logic client-side.

---

# 19. API Separation

The tournament engine should remain a backend responsibility.

The frontend should not calculate:

- team combinations;
- player assignments;
- ranking;
- game distribution;
- tournament scheduling.

The frontend should request the current state through REST APIs.

This guarantees that the same tournament logic can later be consumed by:

- web frontend;
- mobile application;
- scoring application;
- administration dashboard;
- external integrations.

---

# 20. Algorithm Evolution

The first implementation should not attempt to solve every possible optimization problem simultaneously.

The engine should be designed so that additional constraints can be introduced progressively.

### Phase 1 — implemented

- equal game distribution (difference between min and max appearances never exceeds 1);
- 3v3 team generation;
- court assignment — satisfied at run time through the dynamic queue (§5) rather than at
  generation time;
- no player overlap — enforced at assignment time, by construction;
- seeded, reproducible randomization;
- teammate **and** opponent diversity, scored with a lexicographic cost vector.

### Phase 2

Add:

- ranking;
- ranking-based additional games;
- opponent diversity;
- team balance;
- advanced scoring function.

### Phase 3

Add:

- advanced optimization;
- configurable weights;
- tournament simulation;
- statistical analysis;
- improved fairness algorithms.

The architecture should therefore separate:

```text
Game Generation
        ↓
Constraint Validation
        ↓
Candidate Evaluation
        ↓
Selection
        ↓
Persistence
```

rather than implementing everything in a single large algorithm.

---

# 21. Core Principle

The most important rule of the entire tournament engine is:

> **The algorithm exists to optimize the player experience, not simply to generate a valid schedule.**

A schedule is technically valid only if it satisfies the hard constraints.

A good schedule additionally:

- gives everyone approximately the same number of games;
- maximizes player diversity;
- minimizes repeated combinations;
- produces competitive games;
- gives additional opportunities to players who need them;
- creates the best possible conditions for every player to experience meaningful competition.

The ultimate output of the algorithm is therefore not simply a list of games.

It is a **balanced tournament experience**.