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
everything that is specific to that participation: attendance status, jersey number, the skill
rating snapshot (§12.1), and the running tournament statistics (`rankingPoints`, `matchesPlayed`,
`wins`, `pointsScored`, `pointsAllowed`, `finalGroupId`).

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

## 5.1 Choosing the game by hand

The operator does not always want the engine's pick — a coach asks for a game to be brought forward,
or a team is already warmed up. The same reservation is therefore also available for an explicitly
chosen game:

```text
POST /matches/{matchId}/assign   { courtId }
```

It is the same operation with the selection step removed, not a weaker one: the game must still be
`queued`, the court must belong to the tournament and be free, and the six players must all be idle.
The overlap check runs inside the transaction, so a stale client cannot double-book a player; the
request is refused with `409` instead. Re-sending the same court for a game already `ready` there is
a no-op, so a double click does not fail.

## 5.2 Reporting playability

Manual selection only works if the client knows what is selectable, and the answer changes every
time a game starts or ends. Every **queued** game returned by `GET /matches` and `GET /matches/{id}`
therefore carries the overlap check pre-computed:

```text
availability: {
  playable: boolean,             // no player of this game is busy elsewhere
  busyRegistrationIds: string[]  // the players blocking it
}
```

The block is absent on any other status: a game that is already `ready`, `in_progress`, `completed`
or manually `scheduled` is not a candidate for assignment, so playability is meaningless for it.

This keeps the rule where §19 requires it. The frontend greys out the unplayable games and can say
which players are blocking each one, without reproducing the hard constraint client-side. The value
is a snapshot valid at read time, and it is authoritative only in the sense that assignment
re-validates it — the list is a hint for the UI, the transaction is the enforcement.

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
3. Keep games balanced, using the player skill rating described in §12.1.
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

Conceptually:

```text
Candidate Score =

+ Team Diversity
+ Opponent Diversity
+ Skill Balance
+ Game Distribution Balance
- Repeated Teammate Penalty
- Repeated Opponent Penalty
- Unequal Game Count Penalty
```

## 11.1 The implemented cost vector

The engine does not use a weighted sum. Candidates are compared with a
**lexicographic cost vector of integers**, lower is better, which makes the
priority between factors explicit and removes the need to tune weights.

Every game is built in two steps.

**Step 1 — choose the six players.** Candidates are ranked by remaining
appearances owed (descending), then by whether they played the previous game
(players who did are deprioritized), then by a seeded random value. Appearance
equality is a hard constraint, so only players sharing the exact same
`(remaining appearances, played previous game)` key as the last player to make the
cut are interchangeable. Among those, the engine enumerates the possible sextets
and prefers the ones that can be split fairly at all, then the ones with the least
teammate history:

```text
[ max(0, best achievable skill difference - SKILL_TOLERANCE),
  worst repeated-teammate pair count inside the group,
  total repeated-teammate weight inside the group ]
```

This exists because a group of three strong and three weak players has no fair
partition, no matter how it is split.

**Step 2 — split them into two teams.** All 10 distinct 3-vs-3 partitions are
enumerated and scored:

```text
[ max(0, skill difference - SKILL_TOLERANCE),   <- imbalance beyond tolerance
  worst repeated-teammate pair count,
  total repeated-teammate weight,
  worst repeated-opponent pair count,
  total repeated-opponent weight,
  skill difference ]                            <- final tie-break
```

Remaining ties are resolved by a seeded random pick, so the plan is reproducible
from its seed.

## 11.2 The skill tolerance band

`SKILL_TOLERANCE` is the difference between the two team skill sums treated as
irrelevant. It is currently **4 points on the sum of a trio**, roughly 1.3 rating
points per player.

The band is what keeps balance from cannibalizing variety. Inside it the first
component is `0` for every candidate, so the choice is decided entirely by the
teammate and opponent history, exactly as it was before skill ratings existed.
Outside it, balance dominates and unfair splits are discarded before variety is
even considered.

> **Implementation status:** active. The value is tuned against rosters of 6 to 40
> players and 1 to 6 appearances per player. With no balancing the worst single
> game reaches a 24-point imbalance; with the band it stays within 5, while the
> worst repeated-teammate count grows by at most one, and only on rosters whose
> ratings are spread uniformly across the whole 0–10 range. On two-tier and
> realistically clustered rosters the balance is reached at no variety cost at all.
> A tighter band (2) balances marginally better but doubles teammate repetition.
> A looser one (5) stops correcting two-tier rosters, where every possible
> imbalance is a multiple of the gap between the tiers.

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

After every completed game (report, paper complete, or correction) the engine reloads that
player's tournament totals and recomputes `rankingPoints` from scratch:

```text
rankingPoints = max(0,
    wins           * 6
  + mvpAwards      * 3
  + fairPlayAwards * 2
  + ceil(pointsMade / 10)
  + ceil(assists   / 8)
  - ceil(fouls     / 5)
)
```

`ceil` is applied to the **cumulative** box-score counters, not per game. One personal point
then two more is `ceil(3/10) = 1`, not `1 + 1`. A game closed by hand with no report still
awards 6 for a win and nothing from the box score. `Tournament.winPoints` is unused.

These points are what Phase 2 (finals) will read; the generator itself is not in this layer.

**Team numbers and individual numbers are two different things**, and the counters on `Registration`
keep them apart:

| Counter | Source | Meaning |
| --- | --- | --- |
| `matchesPlayed`, `wins` | the game | outcome, from the recorded score |
| `rankingPoints` | both | standing from the formula above, recomputed from totals |
| `pointsScored`, `pointsAllowed` | the game | the **team** score, copied onto all three teammates |
| `pointsMade`, `assists`, `fouls` | the match report | what this player did personally |
| `mvpAwards`, `fairPlayAwards` | the match report | the scorekeeper's subjective calls |

`pointsScored` is *not* individual scoring — `pointsMade` is. The names are kept for compatibility
with the existing API.

**The layering rule.** Team counters are recomputed from the game, individual counters from its
report, and `rankingPoints` from both once those totals exist. A game closed by hand has no report,
so it contributes only the win (6 points) and the team scores. Imprecise basket attribution can
move `pointsMade` and therefore the standing; the match score still decides who won.

All ten counters are engine-managed: `recomputeRegistrationAggregates` recomputes them from scratch
and `$set`s them, so it is self-healing and a correction needs no reversal logic.

The ranking system should be implemented independently from the game generation algorithm so that it can evolve without requiring a rewrite of the scheduling engine.

## 12.1 Player Skill Rating

Distinct from the ranking above, a player carries an optional **skill rating**: an
integer from `0` to `10` expressing a rough, human judgement of how strong that
player is. It is a **permanent attribute of the global player**, set by staff, and
it is the only input the engine has about relative strength.

The two values must not be confused:

| | Skill rating | Tournament ranking |
| --- | --- | --- |
| Lives on | `Player` | `Registration` |
| Scope | Permanent, across tournaments | One tournament |
| Set by | Staff, manually | Computed from results |
| Read by | Team generation, before the tournament starts | Reporting, and Phase 2 allocation |
| Value at generation time | Meaningful | Always zero |

This is why balance uses the skill rating and not `rankingPoints`: at generation
time every player still has zero ranking points, so the ranking carries no signal.

**Default.** The rating is optional. A player without one is treated as **5**, the
midpoint, so a partially rated roster stays usable and a roster with no ratings at
all generates exactly the same schedule it did before the feature existed.

**Snapshot and override.** When a player is registered for a tournament, the rating
is copied onto the registration. The registration value is what the engine reads,
which means:

- retuning a player's rating later does not silently alter tournaments they are
  already registered for;
- the registration value can be edited on its own while the roster is unlocked,
  acting as a per-tournament override (a player who is strong for their age group
  may be average in an older one);
- a registration with no snapshot falls back to the player's current rating.

The resolved rating is also denormalized into the player snapshot of every
generated game, alongside the jersey number and name, so a game carries the
strength it was balanced on. Display identity requires at least one of name or
jersey number; when both are known they are both stored, so the scorer can show
a number even when the child is named, and a nameless player can still be
identified by jersey.

**Roster identity.** Skill ratings are part of the roster fingerprint used by the
preview/generate handshake (§16). Editing a rating between preview and generate
invalidates the preview, exactly as adding or removing a player does, because it
would otherwise produce a schedule different from the one that was approved.

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

`ready → completed` is also reachable, but **only** through a submitted match report (§22): a report
proves the game was played, so a scorekeeper who forgot to press Start must not be able to strand it.
The report sets `startedAt` itself in that case.

A completed game generates the data required to update the tournament ranking.

The score entry therefore triggers the ranking recalculation for the six registrations involved.

---

# 15. Tournament Lifecycle

The lifecycle is a **single linear progression** on `Tournament.status`. There is no second axis to
cross-reference: one field answers "where is this tournament?".

```text
draft ──start──> qualification ──last qualification game──> completed
                       │
                       └── (not yet implemented) ──> finals ──> completed
```

The status is **engine-managed**. It is not accepted on tournament create or update, and moves only
through the start action, game completion, and cancellation.

### draft

The tournament exists and the roster is being built. Players can be associated, removed, marked
present or withdrawn. Courts and configuration are still editable.

Players arrive over time, so this phase is expected to span several editing sessions.

### qualification

The schedule exists as a queue of games and is being played. The **roster, courts and configuration
are locked** — every registration mutation returns `409`. This is what freezes the participant set
the schedule was computed from.

Results arrive from the scorekeepers as games are completed, each one updating the tournament
statistics of the six registrations involved.

The plan can still be discarded with `DELETE /tournaments/{id}/qualification`, but only while no
game has been assigned to a court. That removes every qualification game and returns the tournament
to `draft`, reopening the roster. Once a game has started, discarding is refused: it would
invalidate recorded results.

### finals

**Not implemented.** Reserved for the phase where players are grouped by tournament ranking and
assigned to final games. `Tournament.finalGroups` and `Registration.finalGroupId` already exist as
its data model, but there is no generator and no transition into this state.

Until it exists, completing the last qualification game moves the tournament directly to
`completed`. When the generator lands, that transition becomes `qualification → finals`, and only
the last final closes the tournament.

### completed

Every game has been played and the awards can be given out. The tournament is effectively
read-only, and exists to be queried for results and statistics.

**One audited exception.** A match report can be corrected by admin or staff after the tournament is
`completed` — indeed that is the main reason the correction path exists, since a wrong attribution is
usually noticed while reading the final standings. A correction rewrites the score and the box score
of one game and recomputes the affected standings; it never moves `Tournament.status`, never reopens a
game, and records who changed what and why (§22).

---

# 16. Tournament Generation

The primary entry point is a single **start** action, matching the operator's mental model: the
roster is built over time as players arrive, and one button starts the tournament.

```http
POST /tournaments/{tournamentId}/start
```

It freezes the roster, generates the schedule and puts the tournament in play, in one transaction.
Every player still associated is treated as present — the action itself marks each non-withdrawn
registration as checked in — so attendance is not a separate step the operator has to remember.
Absentees are excluded by marking them `withdrawn` before starting.

Replaying `start` while the plan is still unstarted returns the existing schedule rather than
generating a second one.

For the cases where the draw should be inspected before it is committed, the same generation is
also exposed as a two-step operation: an idempotent **preview** followed by an explicit **commit**.

```http
POST /tournaments/{tournamentId}/qualification/preview
POST /tournaments/{tournamentId}/qualification/generate
```

`preview` is pure: it computes a plan and persists nothing. It returns the plan, its quality
metrics, the `seed` used, and a `rosterFingerprint` — a SHA-256 hash of the sorted registration IDs
**with their resolved skill ratings**, plus the tournament configuration.

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
6. locks the roster by moving `Tournament.status` to `qualification`;
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
- skill rating (§12.1), editable while the roster is unlocked;
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
- scoring application — implemented, see §22;
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
- teammate **and** opponent diversity, scored with a lexicographic cost vector;
- team balance from the player skill rating, inside a tolerance band (§11.2, §12.1).

### Phase 2

Add:

- ranking;
- ranking-based additional games;
- rating updates driven by results;
- advanced scoring function with configurable weights.

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
---

# 22. Match Reporting and the Scorekeeper App

The scorekeeper ("refertista") runs a **separate frontend** on a phone or tablet at courtside: one
scorekeeper per court, recording what happens during the game and submitting it when the game ends.

What is recorded:

- every basket, attributed to a player, worth `1` or `2` points;
- an **optional assist**, attributed to a teammate of the scorer;
- every foul, attributed to a player;
- optionally, at the end, two subjective awards: **MVP** and **fair play** — the second one is
  deliberately not about performance, but about behaviour.

## 22.1 Authenticated referee assignment

The scorekeeper is an authenticated `referee` user. Public registration requires a unique display
`name` (used by staff when assigning a referee to a match), plus email and password. Login remains
email/password and returns that name with the user payload. The scorer app uses the existing
email/password login and receives the normal user JWT:

```text
POST /auth/referee/login                         (public) → user JWT
GET /referee/tournaments                         (referee) → tournaments and courts
GET /referee/tournaments/{id}/matches            (referee) → assigned-court matches
POST /referee/matches/{id}/availability          (referee) → pending availability
POST /matches/{id}/referee-assignment            (staff)   → selected referee
```

The referee can offer availability only after a game has been assigned to a court. Staff opens the
game in the backoffice, sees pending referees and selects exactly one. The assignment is persisted on
the game and is valid only for that game; the next game on the same court requires a new selection.

Only the selected referee can read, start and report the game. A referee who is not selected receives
`403`, even if they know the game's ID. The scorer app never assigns games to courts.

The old shared court-code flow is not part of the MVP scorer API. Court assignment and referee
assignment remain separate concerns: the queue chooses the court, while staff chooses the person.

## 22.2 Offline first: one submission, at the end

The tablet accumulates the whole box score **locally** and sends it **once**, when the game is over.
There is no per-event endpoint and no live score: a gym has unreliable wifi, and a scorekeeper must
never lose thirty baskets to a dropped connection.

Consequences the client must honour:

- the client mints a `submissionId` (UUID) **once**, when Submit is tapped, and replays it verbatim on
  every retry. A replay returns `200` with `idempotent: true` and changes nothing;
- a `401` means "re-pair", never "discard the buffer";
- `clientSequence` is the authoritative ordering of events. `clientRecordedAt` is stored but read by
  nothing, so a tablet with a wrong clock can still submit.

Submitting the report **completes the game**: one call, one transaction, one retry story. It reserves
the next game on the freed court and returns it as `nextMatch`, exactly like the ordinary completion
path. `POST /matches/{id}/complete` remains for the paper fallback.

## 22.3 The team score is authoritative, the attribution is best effort

A single scorekeeper watching a 3v3 game will not attribute every basket. The report therefore carries
**both** the team score and the attributed events:

- attributed points **below** the score are accepted, and the shortfall is stored as
  `unattributedPointsA` / `unattributedPointsB` with a `unattributedPoints` warning in the response;
- attributed points **above** the score are refused with `400` — an unambiguous input error, fixable on
  the tablet in seconds;
- the remainder lives on the report and never on the game.

This is the point of the layering in §12: standings are recomputed from the **game** score, so a
scorekeeper who misses an attribution degrades the box score and can never distort the ranking. The
scoreboard the children and parents just watched stays the official result.

## 22.4 No draws

A game is played to a target score and the first side to reach it wins, so a level score is
structurally impossible and is treated as an input error. Both the report and the correction refuse it
with the same message the completion endpoint already uses:
`Draws are not supported in the current tournament format`.

Supporting draws later would need `Registration.draws` and a `drawPoints` setting; the recompute
service is the only place that would have to learn the new rule.

## 22.5 Correcting a report

Mistakes are fixed from the **back office**, by admin or staff, never from the tablet: once submitted,
the scorekeeper is done.

`PUT /matches/{id}/report` requires a `note` explaining the change, keeps the full previous state in an
append-only `corrections` array with who changed it and when, and bumps a `revision` counter. The
superseded state is never deleted — it is the only way to explain a changed standing to a parent.

A correction recomputes the standings of the six players, so a flipped winner moves `wins` and
`rankingPoints` for all six without any reversal logic.

What a correction must never do, and does not:

- **reserve another game.** The court moved on hours ago; doing so would fail with
  `Court already has an assigned match` depending only on whether that court happens to be busy;
- **touch `status`, `completedAt`, `startedAt` or `courtId`.** Court assignment sorts by `completedAt`
  for its rest heuristic, so rewriting it would silently degrade every later assignment;
- **move `Tournament.status`**, including when the tournament is already `completed` (§15).

A game closed by hand that never got a report can be given one through the same endpoint, and a report
arriving late for such a game is accepted as the better evidence — updating the score and the standings
without touching the schedule.

## 22.6 Not covered yet

- **An abandoned game.** A game nobody ever reports stays `in_progress`, holding its court and its six
  players. The existing escape hatch is a staff completion with a typed score; a real `abandoned`
  status would touch the status enum, the court index and the queue engine.
- **`targetScore` as configuration.** The target that makes draws impossible is a documented rule, but
  nothing validates against it. Recording it would let the backend flag a report whose winner never
  reached the target.
