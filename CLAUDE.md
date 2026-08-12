# MiniHoopsManager Claude Instructions

## Project Context

- This project is the backend for MiniHoopsManager.
- The stack is Node.js, TypeScript, Express, MongoDB, and Mongoose.
- Use Node.js 24 as defined in `.nvmrc` and `package.json`.
- Use pnpm as the package manager and keep `pnpm-lock.yaml` synchronized.
- The application connects to MongoDB Atlas through `MONGODB_URI` in `.env`.
- API documentation is exposed through Swagger.
- Deploy target is Render.

## Project Documentation

These files are the source of truth outside the code. Read the relevant ones before planning a
change, and update them in the same change that alters the behaviour they describe.

- `general-docs.md` — Tournament Engine technical design document: domain rules, scheduling
  algorithm, hard and soft constraints, tournament and match lifecycles. Read it before touching
  `src/modules/tournaments` or `src/modules/matches`. Update it whenever a domain rule, the
  generation flow, or a lifecycle state changes.
- `docs/API.md` — hand-maintained frontend integration guide: TypeScript types, endpoint tables,
  request and response payloads, status codes. Update it whenever an endpoint, a payload, or a
  response shape is added or changed.
- `src/docs/openapi.ts` — hand-written OpenAPI 3.0 spec served at `/docs` and `/docs/openapi.json`.
  There are no `@swagger` JSDoc annotations in the source: every endpoint must be declared here by
  hand under its full `/api/...` path. Keep it consistent with `docs/API.md`.

There is no separate schema reference document. The authoritative data model is the Mongoose schemas
themselves, in `src/modules/*/*.model.ts`.

## Local Workflow

- Run `nvm use` before project commands when the active Node.js version is not 24.
- Install dependencies with `pnpm install`.
- Start development mode with `pnpm dev`.
- Run `pnpm check` for TypeScript validation and `pnpm build` for a production build.
- Start the compiled application with `pnpm start` only after running `pnpm build`.
- Verify a running application with `GET /api/health`.
- Do not require or start a local MongoDB instance when a valid Atlas URI is configured.

## Coding Guidelines

- Keep changes small, focused, and consistent with the existing project structure.
- Prefer TypeScript-first implementations with explicit types.
- Reuse existing utilities and middleware before introducing new abstractions.
- Keep API modules organized by feature under `src/modules`.
- Use English for code identifiers, schema fields, API payloads, route names, and technical documentation.

## Commit Rules

- All commit messages must be written in English.
- All commit messages must follow the Conventional Commits standard.
- Whenever creating a commit, use the format `type(scope): subject` or `type: subject`.
- Use formats such as `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `chore: ...`, and `test: ...`.
- Keep the subject concise and descriptive.

## Backend Conventions

- Validate request payloads with Zod.
- Protect secured routes with the existing JWT auth middleware.
- Keep business logic out of route registration files.
- Update `src/docs/openapi.ts` and `docs/API.md` whenever an endpoint or payload changes, and
  `general-docs.md` whenever the change alters a domain rule or a lifecycle (see Project Documentation).
- Read runtime configuration through `src/config/env.ts`; do not access environment variables ad hoc in feature modules.
- Never commit `.env` or expose MongoDB credentials, JWT secrets, tokens, or connection strings in output.
- When adding or changing API behavior, run `pnpm check` and `pnpm build` before considering the task complete.