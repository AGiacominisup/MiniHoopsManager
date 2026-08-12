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

### Tournament creation flow

The first supported format is always individual rotating-teams `3v3`. Teams are temporary match
snapshots, not persistent entities. A tournament is prepared and started with this flow:

1. Create a draft tournament with courts and `qualificationAppearancesPerPlayer`. Dates are optional.
2. Pick from `GET /tournaments/:id/available-players`, then associate them with
  `POST /tournaments/:id/registrations/bulk`. Removal uses the same path with `DELETE`.
3. Check everyone in with `PATCH /tournaments/:id/registrations/attendance` (omit `registrationIds`
  to apply the status to the whole roster), or one player at a time with
  `PATCH /registrations/:id/attendance`.
4. Read blockers with `GET /tournaments/:id/setup`.
5. Preview deterministic matches with `POST /tournaments/:id/qualification/preview`.
6. Confirm the returned seed and fingerprint with `POST /tournaments/:id/qualification/generate`.
7. Reserve a queued match on a court, start it, then complete it. Completion reserves the next
  compatible match on the same court but does not start it.

Generation requires at least `playersPerMatch` checked-in players **and** at least one enabled
court; `GET /tournaments/:id/setup` reports exactly the blockers the generator enforces.

Only checked-in players enter the plan. Matches are generated as an ordered queue with
`courtId: null` and are bound to a court at run time, so there is no fixed round structure.

Once matches are generated, roster, courts and tournament configuration are locked. The plan can
be cancelled only before any match is assigned to a court; cancelling removes every qualification
match of the tournament.

```ts
export type TournamentStatus = "planned" | "in_progress" | "completed";

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
    status: "draft" | "generated" | "in_progress" | "completed";
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
  "status": "planned",
  "courts": [{ "name": "Court 1" }],
  "finalGroups": [{ "themeName": "Gold", "level": 1 }]
}
```

Only `name` is required. `startDate` and `endDate` are optional; when both are supplied, `endDate`
cannot precede `startDate`. A `PATCH` accepts any non-empty subset of these fields. Deletion
returns `409` while registrations or matches reference the tournament.

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