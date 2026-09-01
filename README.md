# Nutrition Tracker

Local-first, photo-based nutrition tracking. Runs entirely on your machine — no
paid APIs, no cloud sync.

## Setup

Requires [uv](https://docs.astral.sh/uv/) for Python and (from Phase 4 on)
[pnpm](https://pnpm.io/) for the frontend.

```bash
# Install Python dependencies
uv sync
```

## Nutrition database ingest (Phase 1)

Loads USDA FoodData Central (Foundation Foods, SR Legacy, Branded Foods) and
Open Food Facts into `data/app.db`. Both are public bulk downloads — no API
key needed.

```bash
# USDA FoodData Central: foods + per-100g nutrients + full-text search
uv run python -m scripts.ingest_usda

# Open Food Facts: barcode lookups (large download, ~1 GB compressed)
uv run python -m scripts.ingest_openfoodfacts
```

Notes:

- `ingest_usda.py` downloads the current dated zip files directly from
  `fdc.nal.usda.gov` (Foundation + SR Legacy + Branded, not the combined
  "Full" download, to skip the unneeded FNDDS survey dataset). Re-running is
  safe — already-downloaded/extracted files are reused unless you delete
  `data/usda_raw/`.
- `ingest_openfoodfacts.py` streams a large gzip-compressed TSV without fully
  extracting it. Use `--limit N` for a quick local smoke test instead of a
  full ingest (millions of rows).
- Both scripts default to `data/app.db`; override with `--db`.

Run the test suite (fast, network-free — uses small fixture CSVs shaped like
the real bulk exports):

```bash
uv run pytest
```

## Running the app (Phase 4)

Two commands, in separate terminals:

```bash
# Backend API (http://localhost:8000)
uv run uvicorn backend.main:app --reload

# Frontend (http://localhost:5173) -- proxies /api/* to the backend
cd frontend && pnpm install && pnpm dev
```

Open http://localhost:5173.

### Vision provider

Set `VISION_PROVIDER` to choose how meal photos are analyzed (default `ollama`):

```bash
# Local, free, default -- requires Ollama running with a vision model
ollama serve
ollama pull qwen2.5vl
export VISION_PROVIDER=ollama   # or omit -- this is the default

# Anthropic's API instead
export VISION_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-...
```

If the vision provider is unreachable or returns unparseable output twice in a
row, the app falls back to manual food search rather than guessing.

### Barcode scanning

Uses the camera in every browser via `@zxing/browser` (native `BarcodeDetector`
is Chrome/Edge-only). A manual barcode-number field is always available too.

## Dashboard and adaptive calibration (Phase 5)

Set up your profile from the **Dashboard** tab (weight, height, age, sex,
activity level, goal) to see calorie/macro targets and micronutrient progress
against DRI/RDA values, with warnings as you approach Tolerable Upper Intake
Levels.

Log your bodyweight daily from the same tab. After 14+ days of bodyweight
history, the app compares your actual weight trend against your logged
calories and — if they don't match what your logged intake alone would
predict — surfaces an honest note ("Your logs read about N% low compared
with your weight trend — targets adjusted") and corrects future targets
accordingly. This never pushes prescribed calories below the safety floor
(BMR, or 1500/1200 kcal for male/female, whichever is higher).

The 7-day rolling average is shown more prominently than any single day's
total, since one meal's photo-estimated calories are unreliable but a week's
average is not.

## Deploying to Vercel

This app is local-first by design (single SQLite file, local Ollama), so
deploying it requires real architecture changes, not just a framework preset:
Vercel Functions have no durable local disk (SQLite writes wouldn't survive
between requests) and can't run a persistent Ollama process. The app supports
both modes via environment variables — nothing above changes for local dev.

Deployment is **one Vercel project** using [Vercel
Services](https://vercel.com/docs/services): `vercel.json` at the repo root
declares a `frontend` service (the Vite app) and a `backend` service (FastAPI),
routed onto one shared domain — `/api/*` goes to the backend, everything else
to the frontend. Same origin means **no CORS setup and no cross-wiring
frontend/backend URLs**; the frontend's existing relative `/api/...` calls
work in production exactly as they do locally.

Import the repo into Vercel once. It should detect the `services` config
in `vercel.json` and configure both pieces automatically — no per-service
Root Directory or Framework Preset picking needed.

### Env vars: only one is actually required

Vercel sets a `VERCEL` variable on every deployment automatically (nothing to
configure) — the app uses it to auto-detect that it's running there and
switch defaults accordingly, no env vars needed for that switch itself:

- **`VISION_PROVIDER`** auto-defaults to `anthropic` on Vercel (`ollama`
  locally) — set it explicitly only to override.
- **`FOOD_DB_PATH`** auto-resolves to the bundled `backend/data/food_reference.db`
  on Vercel — never needs setting.
- **`ANTHROPIC_API_KEY`** is genuinely optional: without it, photo analysis
  cleanly reports "unavailable, search or scan a barcode instead" instead of
  erroring — search and barcode scanning work regardless. Set it once you
  want photo logging to work in production.
- **`DATABASE_URL`** is the one variable that can't be programmed away — it's
  a pointer to external infrastructure (your Postgres instance), not a
  feature toggle. Without it, the app still boots (falls back to ephemeral
  SQLite in `/tmp`, logged as a warning) rather than crashing, but logged
  data won't reliably persist between requests. Add a Postgres database
  (Storage tab → Neon, or your provider of choice) and set this to actually
  keep your data.

So the honest minimum for a fully working deployment is **one variable**:
`DATABASE_URL`. Deploy with none set at all and the app still runs — you get
a working demo with barcode/manual logging and real USDA nutrition data, just
without photo analysis or durable storage.

### Photo analysis without paying for Anthropic: self-host Ollama

Ollama genuinely cannot run on Vercel (no persistent process), so getting
free photo analysis in production means running Ollama somewhere *else* and
pointing the deployed backend at it over the network:

1. On a machine you control (your own computer left on, a spare machine, or
   a cheap VPS), run Ollama as usual:
   ```bash
   ollama serve
   ollama pull qwen2.5vl
   ```
2. **Put the authenticating proxy in front of it before exposing anything.**
   Ollama has no authentication of its own — tunneling it directly would let
   anyone who finds the URL use your machine's compute for free.
   ```bash
   export OLLAMA_AUTH_PROXY_SECRET=$(openssl rand -hex 32)   # save this value
   uv run python scripts/ollama_auth_proxy.py   # listens on :11435, forwards to :11434
   ```
3. Expose **the proxy's port** (11435, not Ollama's 11434) via a tunnel --
   e.g. `ngrok http 11435` for a quick test, or
   [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)/[Cloudflare
   Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
   if you want something stable to leave running.
4. On the Vercel project, set:

   | Variable | Value |
   |---|---|
   | `VISION_PROVIDER` | `ollama` (overrides the Vercel default of `anthropic`) |
   | `OLLAMA_HOST` | the tunnel's public URL (e.g. `https://your-tunnel.example.com`) |
   | `OLLAMA_API_KEY` | the same value as `OLLAMA_AUTH_PROXY_SECRET` from step 2 |

Requests then flow: Vercel backend → tunnel → auth proxy (checks the shared
secret) → your local Ollama. Free, but only as available as the machine
you're running it on -- if that machine is off, photo analysis falls back
to the manual-entry message rather than erroring.

### Why the backend service is rooted at the repo root, not `backend/`

Vercel Services treat a service's `root` exactly like a standalone project's
Root Directory — everything outside it is excluded from that service's build.
The backend's internal code uses absolute imports (`from backend.db import
...`), which requires `backend/` to still be a real subdirectory relative to
the service root; scoping the service to `backend/` itself would flatten that
away and break every internal import. So `vercel.json`'s backend service uses
`"root": "."` with `"entrypoint": "backend.main:app"` instead — the whole repo
ships with it (small; no issue for the 500MB Python function limit), while the
frontend service is still cleanly scoped to `"root": "frontend/"` since Vite
has no cross-directory dependencies.

### Other things this required

- **Vercel's 4.5MB request body limit** (hard limit, can't be raised) — a
  phone camera photo easily exceeds this, so the frontend now compresses/
  resizes every photo client-side before upload (`frontend/src/utils/image.ts`)
  regardless of deployment target.
- **Bundled food data is Foundation + SR Legacy only** (no Branded Foods, no
  Open Food Facts) to keep the bundle small. To include more, re-run the
  ingest scripts, copy the resulting tables into `backend/data/food_reference.db`
  minus the write-tables, and check the file still fits Vercel's Python
  function size limit (500MB, 5GB on the Large Functions beta) — Branded
  Foods' full dataset is large enough that this needs checking, not assuming.
- If Python dependencies change, regenerate `requirements.txt` (Vercel's
  Python runtime reads this, not `pyproject.toml`):
  ```bash
  uv export --no-dev --no-hashes --format requirements-txt > requirements.txt
  ```

## Project layout

```
vercel.json          Vercel Services config: frontend + backend on one domain
backend/             FastAPI app (routes/), nutrition math (nutrition/), vision providers (vision/)
backend/data/        Bundled read-only reference DB for Vercel deployment (committed)
frontend/            React + Vite + TypeScript + Tailwind
scripts/             Data ingest scripts (USDA, Open Food Facts) -- local-only, not deployed
data/                Local dev SQLite DB and downloaded bulk data (gitignored)
tests/               pytest suite
requirements.txt     Generated from pyproject.toml/uv.lock, for Vercel's Python runtime
```
