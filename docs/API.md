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

`POST /auth/login` is public. Account creation is restricted to authenticated administrators
through the Users API. Every CRUD endpoint requires a JWT:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

User administration endpoints require the `admin` role.

```ts
export type UserRole = "admin" | "coach" | "staff";

export interface AuthResponse {
  message: string;
  token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
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

## Authorization Matrix

| Resource | Read | Create, update, delete |
| --- | --- | --- |
| Tournaments | Any authenticated user | `admin`, `staff` |
| Players | Any authenticated user | `admin`, `staff` |
| Registrations | Any authenticated user | `admin`, `staff` |
| Matches | Any authenticated user | `admin`, `staff` |
| Users | `admin` | `admin` |

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

Anything other than `draft` means the roster, courts and configuration are locked.

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
| `DELETE` | `/tournaments/:id` | `{ message }` |
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
`PATCH` accepts any non-empty subset of the remaining fields. Deletion returns `409` while
registrations or matches reference the tournament.

A player can only be registered if they have a name or a jersey number; a nameless player's jersey
number is copied onto the registration automatically.

## Players

```ts
export interface Player {
  _id: string;
  firstName?: string;
  lastName?: string;
  jerseyNumber?: number;
  birthDate?: string;
  guardianContact?: string;
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
  "guardianContact": "+39 333 0000000"
}
```

At least one field is required. Deletion returns `409` while registrations reference the player.

## Registrations

```ts
export interface Registration {
  _id: string;
  tournamentId: string;
  playerId: string;
  jerseyNumber?: number;
  rankingPoints: number;
  matchesPlayed: number;
  wins: number;
  pointsScored: number;
  pointsAllowed: number;
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
  "finalGroupId": null
}
```

`tournamentId` and `playerId` are required. Statistics are optional non-negative integers and
default to zero. A player can be registered only once per tournament. `finalGroupId`, when set,
must belong to the selected tournament. Deletion returns `409` while a match references the
registration.

## Matches

Generated qualification matches have no scheduled time and no court until they are assigned. They
move through `queued -> ready -> in_progress -> completed`; `ready` means reserved on a court and
waiting for an explicit Start command.

Qualification matches are owned by the tournament generator: `POST` and `PATCH` reject
`phase: "qualification"` with `409`, and generated matches cannot be edited or deleted
individually. Use `DELETE /tournaments/:id/qualification` to discard a whole plan.

To read a generated schedule, filter on `status=queued`; results are ordered by `queuePosition`.

```ts
export type MatchPhase = "qualification" | "final";
export type MatchStatus = "scheduled" | "queued" | "ready" | "in_progress" | "completed";

export interface MatchPlayer {
  registrationId: string;
  jerseyNumber?: number;
  name?: string;
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
  createdAt: string;
  updatedAt: string;
}
```

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/matches?tournamentId=:id&phase=:phase&status=:status` | `{ matches: Match[] }` |
| `POST` | `/matches` | `{ message, match }` |
| `GET` | `/matches/:id` | `{ match }` |
| `PATCH` | `/matches/:id` | `{ message, match }` |
| `DELETE` | `/matches/:id` | `{ message }` |

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
        { "registrationId": "66b000000000000000000101", "jerseyNumber": 4 },
        { "registrationId": "66b000000000000000000102", "jerseyNumber": 7 },
        { "registrationId": "66b000000000000000000103", "name": "Mario Rossi" }
      ]
    },
    {
      "side": "B",
      "players": [
        { "registrationId": "66b000000000000000000104", "jerseyNumber": 5 },
        { "registrationId": "66b000000000000000000105", "jerseyNumber": 8 },
        { "registrationId": "66b000000000000000000106", "name": "Luca Bianchi" }
      ]
    }
  ]
}
```

There must be exactly two teams, one `A` and one `B`, with exactly three distinct registrations
each. Every player snapshot requires `jerseyNumber` or `name`. The court, optional final group,
and all registrations must belong to the selected tournament.

## Users

Only admins can access these endpoints. Password hashes are never returned.

```ts
export interface User {
  id: string;
  email: string;
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

Create payload requires all fields:

```json
{
  "email": "coach@example.com",
  "password": "password123",
  "role": "coach"
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