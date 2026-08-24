# MiniHoopsManager API - Frontend Integration

## Base URL

Configure the deployed backend URL in the frontend environment:

```env
VITE_API_URL=https://minihoopsmanager.onrender.com/api
```

Local development:

```env
VITE_API_URL=http://localhost:3000/api
```

All request and response bodies use JSON. Dates must be ISO 8601 strings and IDs are MongoDB
ObjectId strings.

Interactive documentation is available at `https://minihoopsmanager.onrender.com/docs` and the
OpenAPI document at `https://minihoopsmanager.onrender.com/docs/openapi.json`.

## Authentication

`POST /auth/login`, `POST /auth/referee/login` and `POST /auth/referee/register` are public. The
referee registration creates an account with the `referee` role. Referee accounts can authenticate
in the scorer app, but cannot access backoffice resources. Staff account creation remains restricted
to authenticated administrators through the Users API. Every protected endpoint requires a JWT:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

User administration endpoints require the `admin` role.

```ts
export type UserRole = "admin" | "coach" | "staff" | "referee";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: AuthUser;
}
```

### Login

```http
POST /auth/login
```

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Returns `200 AuthResponse`. Invalid credentials return `401`.

### Referee registration and login

```http
POST /auth/referee/register
POST /auth/referee/login
```

Login accepts `{ email, password }` and returns `200 AuthResponse`, including the referee `name`.
Registration requires `{ email, password, name }`. `name` is a unique display string used when staff
assigns a referee to a match. Registration returns `201` with the created user (without a token). A
duplicate email or name returns `409`. A referee account receives `403` on every backoffice resource.
The scorer uses the returned user token on the referee endpoints and can operate only matches assigned
to that user.

```json
{
  "email": "referee@example.com",
  "password": "password123",
  "name": "Mario Rossi"
}
```

## Authorization Matrix

| Resource | Read | Create, update, delete |
| --- | --- | --- |
| Tournaments | Any authenticated user | `admin`, `staff` |
| Players | Any authenticated user | `admin`, `staff` |
| Registrations | Any authenticated user | `admin`, `staff` |
| Matches | Any authenticated user | `admin`, `staff` |
| Match reports | Any authenticated user | `admin`, `staff`, or the selected referee for that match |
| Users | `admin` | `admin` |

Referee endpoints require a normal user JWT with role `referee`. A referee can request availability
for an assigned-court match, but only the referee selected by staff can start or report it.

## Common Responses

Successful list responses wrap the array in a resource-specific property. Successful single-item
responses wrap the item in its singular property. Create and update responses also include a
`message`.

```ts
export interface ApiErrorResponse {
  message: string;
  errors?: Record<string, string[]>;
}
```

Common status codes:

| Status | Meaning |
| --- | --- |
| `200` | Successful read, update, or delete |
| `201` | Resource created |
| `400` | Invalid payload, ID, query, or related resource |
| `401` | Missing, expired, or invalid JWT |
| `403` | Authenticated user does not have the required role |
| `404` | Resource not found |
| `409` | Duplicate resource or deletion blocked by related data |
| `429` | Too many invalid court access code attempts (code exchange only) |

## Tournaments

### Lifecycle

`Tournament.status` is the single source of truth for where a tournament is, and it only moves
forward:

```text
draft ──start──> qualification ──last qualification match──> completed
                        │
                        └── (future) ──> finals ──> completed
```

`status` is **engine-managed**: it is not accepted on `POST /tournaments` or `PATCH
/tournaments/:id`. It changes only through `POST /tournaments/:id/start`, match completion, and
`DELETE /tournaments/:id/qualification`, which sends it back to `draft`.

`finals` is declared but not yet reachable — the finals generator does not exist, so completing the
last qualification match currently moves the tournament straight to `completed`.

Anything other than `draft` means the roster, courts, configuration and `winPoints` are locked.
`winPoints` is locked with the rest because standings are recomputed from it, so retuning it
mid-tournament would rewrite every result already earned.

### Tournament creation flow

The first supported format is always individual rotating-teams `3v3`. Teams are temporary match
snapshots, not persistent entities. A tournament is prepared and started with this flow:

1. Create the tournament with its courts and `qualificationAppearancesPerPlayer`. Dates are optional.
2. Build the roster. `GET /tournaments/:id/available-players` returns everyone not yet registered;
  `POST /tournaments/:id/registrations/bulk` associates a selection, `DELETE` on the same path
  removes one. To add a player who does not exist yet, `POST /players` first and then associate the
  returned `_id`. This step can be repeated as players arrive: the roster stays open for as long as
  `status` is `draft`, and re-sending the whole list is safe — the response reports
  `summary: { created, alreadyRegistered }`.
3. Optionally read `GET /tournaments/:id/setup` for the current counts and blockers.
4. Start the tournament with `POST /tournaments/:id/start`. This is the single "start" action: it
  freezes the roster, generates the match queue and moves the tournament to `qualification`.
5. Reserve a queued match on a court, start it, then complete it. Completion reserves the next
  compatible match on the same court but does not start it.

Starting requires at least `playersPerMatch` associated players **and** at least one enabled court.

Every player still associated is treated as present: `POST /start` marks each non-withdrawn
registration as `checked_in` itself, so no separate check-in step is required. Mark absentees
`withdrawn` beforehand — with `PATCH /tournaments/:id/registrations/attendance` for several at once,
or `PATCH /registrations/:id/attendance` for one — and they are left out of the schedule.

Matches are generated as an ordered queue with `courtId: null` and are bound to a court at run
time, so there is no fixed round structure.

### Generating with review

`POST /tournaments/:id/start` is a shortcut over a two-step handshake that remains available when
the schedule should be inspected before it is committed:

1. `POST /tournaments/:id/qualification/preview` returns a plan, its metrics, a `seed` and a
  `rosterFingerprint`, and persists nothing. Call it again for a different draw.
2. `POST /tournaments/:id/qualification/generate` commits the reviewed plan by sending that `seed`
  and `rosterFingerprint` back; it fails if the roster changed in the meantime.

Unlike `/start`, this path uses only players who are already `checked_in`. It moves the tournament
to `qualification` all the same.

The `metrics` returned by `preview` describe the quality of the draw:

```ts
export interface QualificationMetrics {
  matches: number;
  extraAppearances: number;          // slots handed out above the requested amount
  maxAppearanceDifference: number;   // never above 1
  maxTeammatePairCount: number;      // worst number of times two players shared a team
  maxOpponentPairCount: number;      // worst number of times two players faced each other
  maxSkillDifference: number;        // worst team-strength gap of a single match
  averageSkillDifference: number;    // mean team-strength gap across the plan
  matchesOverSkillTolerance: number; // matches the balancer could not bring within tolerance
}
```

Team strength is the sum of the three `skillRating` values, so a gap is measured on a 0-30 scale.
`matchesOverSkillTolerance` above zero means the roster itself cannot be split fairly — usually a
handful of players far stronger than the rest — not that the generator failed.

A rating change between `preview` and `generate` invalidates the `rosterFingerprint`, because it
would produce a different plan from the one that was reviewed.

The plan can be cancelled only before any match is assigned to a court; cancelling removes every
qualification match and returns the tournament to `draft`, reopening the roster.

```ts
export type TournamentStatus =
  | "draft"          // created; players are being associated
  | "qualification"  // started; qualification matches are being played
  | "finals"         // qualification is over; final matches are being played
  | "completed";     // everything played; read-only

export interface Tournament {
  _id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  winPoints: number;
  status: TournamentStatus;
  configuration: {
    gameFormat: "3v3";
    competitionFormat: "individual_rotating_teams";
    teamSize: 3;
    playersPerMatch: 6;
    qualificationAppearancesPerPlayer: number;
    queueMode: "dynamic";
  };
  qualification: {
    seed?: string;
    rosterFingerprint?: string;
    generatedAt?: string;
    totalMatches: number;
  };
  courts: Array<{ _id: string; name: string }>;
  finalGroups: Array<{ _id: string; themeName: string; level: number }>;
  createdAt: string;
  updatedAt: string;
}
```

Endpoints:

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/tournaments` | `{ tournaments: Tournament[] }` |
| `POST` | `/tournaments` | `{ message, tournament }` |
| `GET` | `/tournaments/:id` | `{ tournament }` |
| `PATCH` | `/tournaments/:id` | `{ message, tournament }` |
| `DELETE` | `/tournaments/:id` | `{ message, summary: { matches, matchReports, registrations, courtAccessCodes } }` |
| `GET` | `/tournaments/:id/setup` | `{ tournament, attendance, readiness }` |
| `POST` | `/tournaments/:id/start` | `{ message, tournament, matches, idempotent }` |
| `GET` | `/tournaments/:id/available-players` | `{ players: Player[] }` |
| `POST` | `/tournaments/:id/registrations/bulk` | `{ registrations, summary: { created, alreadyRegistered } }` |
| `DELETE` | `/tournaments/:id/registrations/bulk` | `{ message, summary: { deleted } }` |
| `PATCH` | `/tournaments/:id/registrations/attendance` | `{ message, summary: { modified } }` |

Create payload:

```json
{
  "name": "Spring Tournament",
  "startDate": "2026-09-10T09:00:00.000Z",
  "endDate": "2026-09-12T18:00:00.000Z",
  "category": "U12",
  "winPoints": 10,
  "courts": [{ "name": "Court 1" }],
  "finalGroups": [{ "themeName": "Gold", "level": 1 }]
}
```

Only `name` is required. `startDate` and `endDate` are optional; when both are supplied, `endDate`
cannot precede `startDate`. `status` is not accepted — a new tournament always starts as `draft`. A
`PATCH` accepts any non-empty subset of the remaining fields, except that `configuration`, `courts`
and `winPoints` are refused with `409` once the tournament has started. Deletion cascades: every match,
match report, registration and court access code of the tournament is removed in a single transaction,
and the response `summary` reports how many of each were deleted. Players are never deleted, only their
registrations for that tournament.

A player can only be registered if they have a name or a jersey number — at least one is required so
they can be identified. When the player has a jersey number it is always copied onto the
registration, including when they also have a name, and can later be overridden per tournament.
Parents may withhold a child's name; some tournaments play without numbered jerseys. When both are
known, both are stored and returned.

## Players

```ts
export interface Player {
  _id: string;
  firstName?: string;
  lastName?: string;
  jerseyNumber?: number;
  birthDate?: string;
  guardianContact?: string;
  skillRating?: number; // 0-10, perceived strength; used to balance generated teams
  createdAt: string;
  updatedAt: string;
}
```

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/players` | `{ players: Player[] }` |
| `POST` | `/players` | `{ message, player }` |
| `GET` | `/players/:id` | `{ player }` |
| `PATCH` | `/players/:id` | `{ message, player }` |
| `DELETE` | `/players/:id` | `{ message }` |

Create or update payload example:

```json
{
  "firstName": "Mario",
  "lastName": "Rossi",
  "jerseyNumber": 12,
  "birthDate": "2015-05-20T00:00:00.000Z",
  "guardianContact": "+39 333 0000000",
  "skillRating": 7
}
```

At least one field is required. Deletion returns `409` while registrations reference the player.

`skillRating` is an optional integer from `0` to `10` expressing how strong the player is. The team
generator uses it to keep the two teams of a match comparable. A player without a rating is treated
as `5`, so it can be filled in gradually and a roster with no ratings at all generates exactly the
same schedule as before. The rating is copied onto the registration when the player joins a
tournament, so retuning it later does not alter tournaments they are already registered for.

## Registrations

```ts
export interface Registration {
  _id: string;
  tournamentId: string;
  playerId: string;
  jerseyNumber?: number;
  skillRating?: number; // snapshot of Player.skillRating, and the per-tournament override
  rankingPoints: number;
  matchesPlayed: number;
  wins: number;
  pointsScored: number;  // TEAM score of every match played, not this player's own points
  pointsAllowed: number; // TEAM score conceded
  pointsMade: number;    // points this player scored personally, from the match reports
  assists: number;
  fouls: number;
  mvpAwards: number;
  fairPlayAwards: number;
  finalGroupId: string | null;
  attendanceStatus: "registered" | "checked_in" | "withdrawn";
  checkedInAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/registrations?tournamentId=:id&playerId=:id` | `{ registrations: Registration[] }` |
| `POST` | `/registrations` | `{ message, registration }` |
| `GET` | `/registrations/:id` | `{ registration }` |
| `PATCH` | `/registrations/:id` | `{ message, registration }` |
| `DELETE` | `/registrations/:id` | `{ message }` |

Create payload:

```json
{
  "tournamentId": "66b000000000000000000001",
  "playerId": "66b000000000000000000002",
  "jerseyNumber": 12,
  "skillRating": 7,
  "finalGroupId": null
}
```

`tournamentId` and `playerId` are required. Statistics are optional non-negative integers and
default to zero. A player can be registered only once per tournament. `finalGroupId`, when set,
must belong to the selected tournament. Deletion returns `409` while a match references the
registration.

`skillRating` defaults to the player's own rating and only needs to be sent to override it for this
tournament — useful when a player who is strong for one age group is average in another. It can be
changed with `PATCH` while the roster is unlocked, and is read by the team generator in preference
to the player's rating.

### Statistics are engine-managed

The ten counters above are derived, not authored. Team numbers (`matchesPlayed`, `wins`,
`rankingPoints`, `pointsScored`, `pointsAllowed`) are recomputed from the completed matches;
individual numbers (`pointsMade`, `assists`, `fouls`, `mvpAwards`, `fairPlayAwards`) come from the
submitted [match reports](#match-reports).

`pointsScored` is the **team** score copied onto all three teammates — individual scoring is
`pointsMade`. The names are kept for compatibility.

Treat all ten as read-only. The five older ones are still accepted by `PATCH /registrations/:id` for
compatibility, but a hand-edited value is overwritten by the next report submission or correction that
touches that player, and the five newer ones are not accepted at all.

`POST /tournaments/:id/recompute-aggregates` (admin only) rebuilds every counter of the tournament
from the completed matches and their reports. It returns
`{ message, summary: { registrations } }` and is the escape hatch if a total ever looks wrong.

## Matches

Generated qualification matches have no scheduled time and no court until they are assigned. They
move through `queued -> ready -> in_progress -> completed`; `ready` means reserved on a court and
waiting for an explicit Start command. `ready -> completed` is also reachable, but only by submitting
a [match report](#match-reports): a report proves the game was played, so a forgotten Start does not
strand it.

Qualification matches are owned by the tournament generator: `POST` and `PATCH` reject
`phase: "qualification"` with `409`, and generated matches cannot be edited or deleted
individually. Use `DELETE /tournaments/:id/qualification` to discard a whole plan. Submitting or
correcting a **report** is the exception — it works on generated matches, because it records what
happened rather than changing the composition.

To read a generated schedule, filter on `status=queued`; results are ordered by `queuePosition`.

### Which matches can actually be played now

A player cannot be in two matches at once, so a queued match is playable only while none of its six
players is engaged in a `ready` or `in_progress` match. `GET /matches` and `GET /matches/:id`
therefore return an `availability` block on every **queued** match; it is absent on any other
status, because those matches are already bound to a court, played, or manually managed.

Use it to enable or disable the match in the court-assignment UI: when a court frees up, only the
matches with `availability.playable === true` can be assigned to it. `busyRegistrationIds` lists the
players that are blocking the match, so the UI can explain why.

Availability is computed at read time and changes whenever any match starts or completes — refresh
the list after every assignment, start, or completion.

```ts
export type MatchPhase = "qualification" | "final";
export type MatchStatus = "scheduled" | "queued" | "ready" | "in_progress" | "completed";

export interface MatchAvailability {
  playable: boolean;             // no player of this match is busy elsewhere
  busyRegistrationIds: string[]; // the players blocking it, empty when playable
}

export interface MatchPlayer {
  registrationId: string;
  jerseyNumber?: number; // present when known
  name?: string;         // present when known
  skillRating?: number;  // the rating the match was balanced on
}

export interface Match {
  _id: string;
  tournamentId: string;
  courtId: string | null;
  finalGroupId: string | null;
  phase: MatchPhase;
  scheduledAt?: string;
  status: MatchStatus;
  queuePosition?: number;
  scoreA: number;
  scoreB: number;
  teams: Array<{
    side: "A" | "B";
    players: MatchPlayer[];
  }>;
  availability?: MatchAvailability; // queued matches only
  createdAt: string;
  updatedAt: string;
}
```

Every `MatchPlayer` requires at least one of `jerseyNumber` or `name`. When both are known they are
both returned, including on the referee scorer endpoints.

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/matches?tournamentId=:id&phase=:phase&status=:status` | `{ matches: Match[] }` |
| `POST` | `/matches` | `{ message, match }` |
| `GET` | `/matches/:id` | `{ match }` |
| `PATCH` | `/matches/:id` | `{ message, match }` |
| `DELETE` | `/matches/:id` | `{ message }` |
| `POST` | `/matches/:id/assign` | `{ message, match }` |
| `POST` | `/tournaments/:id/courts/:courtId/assign-next` | `{ match: Match | null }` |
| `POST` | `/matches/:id/start` | `{ message, match }` |
| `POST` | `/matches/:id/complete` | `{ message, match, nextMatch, idempotent }` |

### Assigning a match to a court

```http
POST /api/matches/:id/assign
{ "courtId": "66b000000000000000000010" }
```

Binds a `queued` match to a free court and moves it to `ready`, meaning reserved and waiting for
`POST /matches/:id/start`. The court must belong to the match's tournament and be enabled.

The player-overlap rule is re-checked inside the transaction, so a match that looked playable in a
stale list is refused rather than double-booking a player:

| Status | Reason |
| --- | --- |
| `200` | Assigned. Replaying the same `courtId` on an already `ready` match returns it unchanged |
| `404` | Match not found, or the court is not an enabled court of the tournament |
| `409` | `Only a queued match can be assigned to a court` |
| `409` | `Court already has an assigned match` |
| `409` | `Match players are already busy in another match: <registrationIds>` |
| `409` | `Match was assigned by another request` — concurrent assignment won the race |

To let the backend pick instead of choosing a match, use
`POST /tournaments/:id/courts/:courtId/assign-next`, which walks the queue in order and reserves the
first playable match, preferring the ones with the fewest players from the match that just ended. It
returns `{ match: null }` when nothing is currently playable. Completing a match runs the same
selection automatically on the freed court and returns the reservation as `nextMatch`.

### Frontend court workflow

The frontend should treat court assignment and match start as two separate actions. Assignment is a
reservation; it does not mean that the game has started. The state machine for generated qualification
matches is:

```text
queued --assign--> ready --start--> in_progress --complete/report--> completed
                         ^                                      |
                         |                                      +--> nextMatch: ready | null
                         +---------- next court reservation ----+
```

The normal staff/operator flow is:

1. Load `GET /matches?tournamentId=:id&phase=qualification&status=queued` and display the matches in
   `queuePosition` order. Use `availability.playable` to enable the assignment action and show
   `busyRegistrationIds` when it is false.
2. When a court is free, either call `POST /matches/:matchId/assign` with the selected `courtId`, or
   call `POST /tournaments/:id/courts/:courtId/assign-next` and let the backend choose.
3. Refresh the match list. The assigned match is now `ready`, has the selected `courtId`, and its six
   players are considered busy. The operator can show a "ready to start" state on the court.
4. When play begins, call `POST /matches/:matchId/start`. The match becomes `in_progress`.
5. When play ends, prefer submitting a match report. A report completes the match and automatically
   reserves the next compatible match on the same court. For the paper/manual fallback, call
   `POST /matches/:matchId/complete` with `scoreA` and `scoreB`; this endpoint requires the match to
   be `in_progress` and also returns the next reservation.

The assignment response has this shape:

```ts
export interface AssignMatchResponse {
  message: "Match assigned";
  match: Match; // status is "ready", courtId is not null
}

export interface AssignNextResponse {
  match: Match | null; // null means no compatible queued match exists now
}
```

`assign-next` is safe to call whenever a court is free. If the court already has a `ready` match, it
returns that reservation. If it has an `in_progress` or manually `scheduled` match, it returns `409`.
The endpoint chooses the first compatible queued match, but among compatible matches it prefers the
ones sharing the fewest players with the last completed match, then uses `queuePosition` as the tie
breaker. This gives players a break without making the frontend reproduce scheduling rules.

The `availability` field is only a read-time hint. Two operators can read the same playable match at
the same time, so the backend repeats the court and player checks inside a transaction. The frontend
must handle these responses by refreshing the queued list instead of retrying the same assignment
blindly:

| Status | Meaning | Frontend action |
| --- | --- | --- |
| `200` | Match reserved or already reserved on the same court | Update the court and match views |
| `404` | Match, tournament, or enabled court not found | Refresh tournament data and show an error |
| `409` | Court occupied, match no longer queued, players busy, or concurrent assignment | Refresh matches and let the operator choose again |

After every assignment, start, completion, or report submission, refresh at least the affected court
and the queued matches. A polling interval of 5-10 seconds is appropriate for an operator dashboard;
the response from the action itself should be applied immediately so the UI does not wait for the next
poll.

### Starting from the scorer app

After login, the referee loads the tournament and court list, then requests availability for a match
already assigned to a court. Once staff selects the referee, `GET /referee/matches/:id` returns the
match. The referee can then start it and submit its report. A new match on the same court requires a
new availability request and staff selection.

Create payload:

```json
{
  "tournamentId": "66b000000000000000000001",
  "courtId": "66b000000000000000000010",
  "finalGroupId": null,
  "phase": "final",
  "scheduledAt": "2026-09-10T10:00:00.000Z",
  "status": "scheduled",
  "scoreA": 0,
  "scoreB": 0,
  "teams": [
    {
      "side": "A",
      "players": [
        { "registrationId": "66b000000000000000000101", "jerseyNumber": 4, "name": "Mario Rossi" },
        { "registrationId": "66b000000000000000000102", "jerseyNumber": 7 },
        { "registrationId": "66b000000000000000000103", "name": "Luca Bianchi" }
      ]
    },
    {
      "side": "B",
      "players": [
        { "registrationId": "66b000000000000000000104", "jerseyNumber": 5, "name": "Anna Verdi" },
        { "registrationId": "66b000000000000000000105", "jerseyNumber": 8 },
        { "registrationId": "66b000000000000000000106", "name": "Giorgio Neri" }
      ]
    }
  ]
}
```

There must be exactly two teams, one `A` and one `B`, with exactly three distinct registrations
each. Every player snapshot requires at least one of `jerseyNumber` or `name`. When both are known
they are both stored and returned — a numbered unnamed player and a named player without a jersey
are both valid. The court, optional final group, and all registrations must belong to the selected
tournament.

Generated qualification matches follow the same rule: the snapshot copies the registration jersey
number (falling back to the player record) and the player's display name, so the scorer and the
backoffice see both fields whenever both exist.

## Referee scorer flow

The scorer app uses the existing referee account and JWT login. The referee is not authenticated by a
shared court code. A referee can see tournaments, courts and matches already assigned to a court, but
can operate a match only after staff selects that referee for it.

### Scorer endpoints

  | Method | Path | Role | Response |
  | --- | --- | --- | --- |
  | `POST` | `/auth/referee/login` | public | `{ token, user }` |
  | `GET` | `/referee/tournaments` | `referee` | `{ tournaments }` with courts |
  | `GET` | `/referee/tournaments/:id/matches` | `referee` | `{ matches }` with own availability |
  | `POST` | `/referee/matches/:id/availability` | `referee` | `{ availability }` |
  | `DELETE` | `/referee/matches/:id/availability` | `referee` | `{ availability }` |
  | `GET` | `/referee/matches/:id` | `referee` | `{ match }`, only when selected |
  | `POST` | `/referee/matches/:id/start` | selected `referee` | `{ message, match }` |
| `POST` | `/referee/matches/:id/report` | selected `referee` | report result and `nextMatch` |

Availability can be requested only for an incomplete match already assigned to a court. Staff sees
the pending requests with `GET /matches/:id/referee-availability` (each populated with the referee
`name` and `email`) and selects one with:

```http
POST /api/matches/:id/referee-assignment
{ "refereeUserId": "66b000000000000000000011" }
```

Only one referee can be selected. The selection is per match and is not inherited by the next match.
The selected referee is the only referee allowed to read, start and report that match; another referee
receives `403`.

### Starting from the scorer app

After login, the referee loads the tournament and court list, then requests availability for a match
already assigned to a court. Once staff selects the referee, `GET /referee/matches/:id` returns the
match. The referee can then start it and submit its report. A new match on the same court requires a
new availability request and staff selection.

## Match reports

A report is the box score of one match: baskets attributed to players, optional assists, fouls, and two
optional subjective awards. It is submitted **once, when the match is over** — the tablet buffers
everything locally during play, so there is no per-event endpoint and no live score.

```ts
export interface MatchReportBasketInput {
  registrationId: string;
  points: 1 | 2;
  assistRegistrationId?: string | null; // must be a different player on the same team
  clientSequence: number;               // unique across baskets and fouls; the authoritative order
  clientRecordedAt?: string;            // informational only, never trusted
}

export interface MatchReportFoulInput {
  registrationId: string;
  clientSequence: number;
  clientRecordedAt?: string;
}

export interface MatchReportSubmitRequest {
  submissionId: string;   // UUID, minted once when Submit is tapped, replayed verbatim on retries
  scoreA: number;
  scoreB: number;
  baskets?: MatchReportBasketInput[];   // max 200
  fouls?: MatchReportFoulInput[];       // max 60
  awards?: {
    mvpRegistrationId?: string | null;
    fairPlayRegistrationId?: string | null;
  };
}

export interface MatchReportPlayerLine {
  registrationId: string;
  side: "A" | "B";
  points: number;
  onePointers: number;
  twoPointers: number;
  assists: number;
  fouls: number;
}

export interface MatchReport {
  _id: string;
  matchId: string;
  tournamentId: string;
  courtId: string;
  submissionId: string;
  scoreA: number;
  scoreB: number;
  unattributedPointsA: number;  // reported score minus the points attributed to a player
  unattributedPointsB: number;
  baskets: Array<MatchReportBasketInput & { side: "A" | "B" }>;
  fouls: Array<MatchReportFoulInput & { side: "A" | "B" }>;
  boxScore: MatchReportPlayerLine[];   // exactly 6 lines, derived server-side
  awards: { mvpRegistrationId: string | null; fairPlayRegistrationId: string | null };
  submittedBy: { kind: "referee_session" | "user"; sessionId?: string; userId?: string };
  submittedAt: string;
  revision: number;                    // 0 on submission, +1 per correction
  corrections: Array<{
    revision: number;
    correctedBy: string;
    correctedAt: string;
    note?: string;
    previousScoreA: number;
    previousScoreB: number;
    previousBaskets: MatchReport["baskets"];
    previousFouls: MatchReport["fouls"];
    previousAwards: MatchReport["awards"];
  }>;
  createdAt: string;
  updatedAt: string;
}
```

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| `POST` | `/referee/matches/:id/report` | selected referee | `{ message, report, match, nextMatch, warnings, idempotent }` |
| `GET` | `/matches/:id/report` | authenticated | `{ report }` |
| `POST` | `/matches/:id/report` | `admin`, `staff` | same as the referee submit |
| `PUT` | `/matches/:id/report` | `admin`, `staff` | `{ message, report, match, warnings }` |

`side` is derived by the server from the team that holds the player: do not send it.

### Submitting completes the match

One call, one transaction. It sets the match to `completed`, records the score, reserves the next
compatible match on the freed court and returns it as `nextMatch`, and closes the tournament when
nothing is left to play — exactly like `POST /matches/:id/complete`, which remains available for the
paper fallback.

A `ready` match can be reported directly: a report proves the game was played, so forgetting to press
Start does not strand it.

| Status | Meaning |
| --- | --- |
| `201` | Report stored and match completed |
| `200` | Idempotent replay (`idempotent: true`), or a report accepted for an already completed match |
| `400` | Invalid payload, a draw, over-attribution, or a player/assist/award outside the match |
| `401` | Missing or invalid token, or the court session was revoked |
| `403` | `Match does not belong to the bound court` |
| `404` | `Match not found` |
| `409` | `A different report was already submitted for this match` |
| `409` | `Only a ready or in-progress match can be reported` |

### Attribution is best effort

A single scorekeeper will not attribute every basket, so the **team score is authoritative** and the
events are cross-checked against it:

- attributed points **below** the score are accepted; the shortfall is returned as
  `unattributedPointsA` / `unattributedPointsB` and `warnings: ["unattributedPoints"]`, so the UI can
  say "3 points not attributed — submitted anyway";
- attributed points **above** the score are refused with
  `400 Attributed points exceed the reported score for side A`.

Standings are always computed from the match score, never from the events, so an imprecise attribution
degrades only the box score.

Draws are refused with `400 Draws are not supported in the current tournament format`: a match is
played to a target score, so the tablet should disable Submit while the scores are level.

MVP and fair play may be the same player, may be on the losing side, and may have scored nothing. Both
are optional.

### The offline-first client contract

Three rules the tablet must follow:

1. **Mint `submissionId` once**, when the scorekeeper taps Submit, persist it locally, and replay it
   byte-identically on every retry. A replay returns `200` with `idempotent: true` and changes nothing.
   A *new* `submissionId` for a match that already has a report returns `409`.
2. **On `401`, show the pairing screen and keep the buffer.** A revoked or rotated code must never cost
   the scorekeeper a match; after re-pairing, resubmit the same payload with the same `submissionId`.
3. **Order events with `clientSequence`, not with time.** `clientRecordedAt` is stored for forensics and
   read by nothing, so a tablet with a wrong clock still submits correctly.

### Correcting a report

```http
PUT /api/matches/:id/report
{ "scoreA": 14, "scoreB": 11, "baskets": [...], "fouls": [...], "awards": {...},
  "note": "Last basket credited to the wrong player" }
```

Admin and staff only — never the tablet. `note` is required. The match must be `completed`.

This is the **only** way a completed result changes: `POST /matches/:id/complete` still answers
`409 Completed match result cannot be changed`. A correction is allowed even after the tournament is
`completed`, which is the main use case — fixing the standings before the awards.

The previous state is kept in full in `corrections` and `revision` is bumped; nothing is ever deleted.
The standings of the six players are recomputed, so a correction that flips the winner moves `wins` and
`rankingPoints` for all six. It never reserves another match, never changes the match status or its
timestamps, and never moves the tournament status.

A match completed by hand with no report can be given one through the same endpoint (it is created at
`revision: 0`). A report arriving late for such a match through the normal submit path is also accepted
as the better evidence: it updates the score and the standings without touching the schedule.

| Status | Meaning |
| --- | --- |
| `200` | Corrected |
| `400` | Same validation as the submit, plus a missing `note` |
| `404` | `Match not found` |
| `409` | `Only a completed match can be corrected` |
| `409` | `Match report was modified concurrently` |
| `409` | `Match report revision limit reached` (20 corrections) |

## Users

Only admins can access these endpoints. Password hashes are never returned. The `referee` role can
also be created here, but public referee registration is available through `/auth/referee/register`.

```ts
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}
```

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/users` | `{ users: User[] }` |
| `POST` | `/users` | `{ message, user }` |
| `GET` | `/users/:id` | `{ user }` |
| `PATCH` | `/users/:id` | `{ message, user }` |
| `DELETE` | `/users/:id` | `{ message }` |

Create payload requires `email`, `password` and `role`. `name` is optional for staff-created users
and required for public referee registration. When set, it must be unique.

```json
{
  "email": "coach@example.com",
  "password": "password123",
  "role": "coach",
  "name": "Mario Rossi"
}
```

`PATCH` accepts any non-empty subset. An admin cannot delete their own active user account.

## Frontend Client Example

```ts
const API_URL = import.meta.env.VITE_API_URL;

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }

  return body as T;
}
```

Usage:

```ts
const { tournaments } = await apiRequest<{ tournaments: Tournament[] }>(
  "/tournaments",
  {},
  token
);
```