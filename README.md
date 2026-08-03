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

- Node.js 20+
- MongoDB (locale o MongoDB Atlas)

## Setup locale

1. Installa dipendenze:

```bash
npm install
```

2. Crea il file `.env` partendo da `.env.example`.

3. Avvia in sviluppo:

```bash
npm run dev
```

4. Build produzione:

```bash
npm run build
npm start
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
- `GET /api/tournaments` (richiede Bearer token)
- `POST /api/tournaments` (richiede Bearer token + ruolo `admin` o `staff`)

## Swagger

Documentazione interattiva:

- `GET /docs`

Spec OpenAPI JSON:

- `GET /docs/openapi.json`

## Deploy su Render

Configura il servizio Web con:

- Build Command: `npm install && npm run build`
- Start Command: `npm start`

Environment variables su Render:

- `NODE_ENV=production`
- `PORT` (Render la fornisce automaticamente, puoi non forzarla)
- `MONGODB_URI` (Atlas consigliato)
- `JWT_SECRET`
- `JWT_EXPIRES_IN=7d`

Health check path consigliato:

- `/api/health`
