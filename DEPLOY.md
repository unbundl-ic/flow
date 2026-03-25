# Production deployment (Vercel + worker)

## Overview

- **Vercel**: Next.js UI and API routes. Set `MONGODB_URI` (the app uses Mongo automatically), `WORKER_URL`, `WORKER_SECRET`, `CRON_SECRET`, and `DISABLE_IN_PROCESS_SCHEDULER=true`. Optional: `STORE_BACKEND=file` only if you intentionally want JSON files instead of Mongo (not typical on Vercel).
- **Worker**: Docker image from the repo `Dockerfile` (Playwright + MongoDB). Same `MONGODB_URI` and `WORKER_SECRET` as Vercel.
- **MongoDB Atlas** (or any MongoDB): single database for brands, flows, and jobs.

## Order of operations

1. Create a MongoDB database and note the connection string (`MONGODB_URI`).
   - **Atlas network access**: add `0.0.0.0/0` (or your worker static egress IP) so Vercel serverless and the worker container can connect.
2. Deploy the **worker** container (Fly.io, Railway, Render, etc.) with env:
   - `MONGODB_URI`
   - `WORKER_SECRET` (long random string)
   - `PORT` (optional, default `8787`)
   - Load balancers may use unauthenticated `GET /health` on the worker (returns `{ "ok": true }`).
3. One-time: from your machine, with local `data/` JSON files, run  
   `MONGODB_URI=... npm run migrate:mongo`  
   Or create data via the app after switching the app to Mongo.
4. Configure **Vercel** → Project → **Settings → Environment Variables** (Production):
   - `MONGODB_URI` (required; enables Mongo for the UI/API — no separate `STORE_BACKEND` needed)
   - `WORKER_URL` — public base URL of the worker (no trailing slash), e.g. `https://flow-worker.fly.dev`
   - `WORKER_SECRET` — same value as on the worker
   - `CRON_SECRET` — random secret; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when this env is set
   - `DISABLE_IN_PROCESS_SCHEDULER=true`
   - `NEXT_PUBLIC_APP_URL` — your production site URL (used by any remaining self-HTTP calls)
5. Optional live preview on production:
   - `NEXT_PUBLIC_ENABLE_LIVE_PREVIEW=true`
   - `NEXT_PUBLIC_STREAM_POLL_MS=800` (JPEG polling via `/api/stream` → worker)

## Local development

- **Mongo (recommended when you use Atlas)**: put `MONGODB_URI` in `.env.local`. The app will read/write brands, flows, and jobs in Mongo — same as production. Restart `next dev` after changing env.
- **JSON files only**: omit `MONGODB_URI`, or set `STORE_BACKEND=file` if you keep a URI for migrate/worker but want the Next app to use `data/*.json`.

- **Worker locally**: `npm run worker` with `MONGODB_URI` and `WORKER_SECRET` set; in another shell run Next with `WORKER_URL=http://localhost:8787` and matching `WORKER_SECRET`.

### Optional: delete a brand from Mongo via CLI

If you ever need to remove a brand without the UI: `npm run delete-brand:mongo -- <brandId>` (see `scripts/delete-brand-mongo.ts`).

## Worker image (local build example)

From the repo root:

```bash
docker build -t flow-worker .
docker run --rm -e MONGODB_URI="..." -e WORKER_SECRET="..." -p 8787:8787 flow-worker
```

Then `curl http://localhost:8787/health` should return `{"ok":true}`.

## Cron

[`vercel.json`](vercel.json) schedules `GET /api/cron/dispatch` every 5 minutes. The route returns 401 unless `Authorization: Bearer <CRON_SECRET>` matches.

**Important:** define `CRON_SECRET` in Vercel project env so Vercel Cron attaches the `Authorization` header to the request.

## Post-deploy smoke checks (optional)

After setting env vars, from your machine:

```bash
WORKER_URL=https://your-worker.example.com node scripts/smoke-rollout.mjs
APP_URL=https://your-app.vercel.app CRON_SECRET=your_secret node scripts/smoke-rollout.mjs
```

Or use `npm run smoke:rollout` with the same variables in the environment.

## Environment reference

| Variable | Where | Purpose |
|----------|--------|---------|
| `STORE_BACKEND` | Vercel, local | Optional. `file` forces JSON files even when `MONGODB_URI` is set. Omit otherwise — Mongo is used when `MONGODB_URI` is set. |
| `MONGODB_URI` | Vercel, worker, migrate script | MongoDB connection; when set, Next.js app uses Mongo for brands/flows/jobs |
| `WORKER_URL` | Vercel | Base URL for `POST /execute`, screenshot, interact, control |
| `WORKER_SECRET` | Vercel, worker | Bearer token for worker HTTP API |
| `CRON_SECRET` | Vercel | Secures `/api/cron/dispatch` |
| `DISABLE_IN_PROCESS_SCHEDULER` | Vercel | Set `true` to disable in-memory `node-cron` |
| `NEXT_PUBLIC_ENABLE_LIVE_PREVIEW` | Vercel | `true` to enable stream (localhost: WebSocket; otherwise HTTP poll) |
| `NEXT_PUBLIC_STREAM_POLL_MS` | Vercel | Poll interval for stream when not on localhost |
