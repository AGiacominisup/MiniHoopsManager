# MiniHoopsManager Copilot Instructions

## Project Context

- This project is the backend for MiniHoopsManager.
- The stack is Node.js, TypeScript, Express, MongoDB, and Mongoose.
- API documentation is exposed through Swagger.
- Deploy target is Render.

## Coding Guidelines

- Keep changes small, focused, and consistent with the existing project structure.
- Prefer TypeScript-first implementations with explicit types.
- Reuse existing utilities and middleware before introducing new abstractions.
- Keep API modules organized by feature under `src/modules`.
- Use English for code identifiers, schema fields, API payloads, route names, and technical documentation.

## Commit Rules

- All commit messages must be written in English.
- All commit messages must follow the Conventional Commits standard.
- Use formats such as `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `chore: ...`, and `test: ...`.
- Keep the subject concise and descriptive.

## Backend Conventions

- Validate request payloads with Zod.
- Protect secured routes with the existing JWT auth middleware.
- Keep business logic out of route registration files.
- Update Swagger documentation when new endpoints or payloads are added.