# MiniHoopsManager
Gestionale per tornei di basket.

## Backend API (Node.js + TypeScript + MongoDB)

Questo repository contiene ora uno scheletro backend pronto per Render con:

- Express + TypeScript
- MongoDB con Mongoose
- Autenticazione JWT con ruoli (`admin`, `coach`, `staff`)
- Endpoints base per auth e tornei
- Documentazione API con Swagger UI
- Healthcheck per monitoraggio Render

## Requisiti

- Node.js 24+
- MongoDB (Docker locale o MongoDB Atlas)

## Setup locale

1. Seleziona la versione Node.js del progetto:

```bash
nvm use
```

2. Installa dipendenze:

```bash
pnpm install
```

3. Crea il file `.env` partendo da `.env.example`.

4. Avvia MongoDB locale:

```bash
docker compose up -d --wait mongodb
```

5. Avvia in sviluppo:

```bash
pnpm dev
```

6. Build e avvio produzione:

```bash
pnpm build
pnpm start
```

## Variabili ambiente

Vedi `.env.example`:

- `NODE_ENV`
- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`

## API disponibili

Base path: `/api`

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET|POST /api/tournaments`
- `GET|PATCH|DELETE /api/tournaments/:id`
- `GET|POST /api/players`
- `GET|PATCH|DELETE /api/players/:id`
- `GET|POST /api/registrations`
- `GET|PATCH|DELETE /api/registrations/:id`
- `GET|POST /api/matches`
- `GET|PATCH|DELETE /api/matches/:id`
- `GET|POST /api/users` (solo ruolo `admin`)
- `GET|PATCH|DELETE /api/users/:id` (solo ruolo `admin`)

Tutte le route CRUD richiedono un Bearer token. Le operazioni di scrittura su tornei,
giocatori, iscrizioni e partite richiedono il ruolo `admin` o `staff`.

## Swagger

Documentazione interattiva:

- `GET /docs`

Spec OpenAPI JSON:

- `GET /docs/openapi.json`

Guida di integrazione frontend con payload e tipi TypeScript:

- [`docs/API.md`](docs/API.md)

## Deploy su Render

Configura il servizio Web con:

- Build Command: `pnpm install --frozen-lockfile --prod=false && pnpm build`
- Start Command: `pnpm start`

Il file `render.yaml` contiene la stessa configurazione. L'opzione `--prod=false` è
necessaria perché TypeScript e i pacchetti `@types` servono durante la build anche
quando `NODE_ENV=production`.

Environment variables su Render:

- `NODE_ENV=production`
- `PORT` (Render la fornisce automaticamente, puoi non forzarla)
- `MONGODB_URI` (Atlas consigliato)
- `JWT_SECRET`
- `JWT_EXPIRES_IN=7d`

Health check path consigliato:

- `/api/health`
