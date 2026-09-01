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

Deploy as **two separate Vercel projects from the same GitHub repo** (Vercel's
documented pattern for monorepos):

### 1. Backend project

Leave **Root Directory** as the repo root (not `backend/`) — `backend/food_lookup.py`
imports from the sibling `scripts/` package, so the whole repo needs to ship
together. Vercel finds the FastAPI app via `[tool.vercel] entrypoint` in
`pyproject.toml` and installs from the root `requirements.txt`. Framework
Preset: **Other** (or whatever Vercel auto-detects for the Python entrypoint —
there's no dedicated "FastAPI" preset slot).

Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | A Postgres connection string (Vercel Postgres, Neon, etc.) — use your provider's **pooled** connection string, since serverless functions can open many concurrent connections |
| `FOOD_DB_PATH` | `backend/data/food_reference.db` — the bundled read-only USDA reference data (Foundation + SR Legacy, ~13MB, committed to the repo) |
| `VISION_PROVIDER` | `anthropic` — Ollama can't run on Vercel |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `CORS_ORIGINS` | The frontend project's URL, once you have it (see step 3) |

The write-tables (profile, logged meals, bodyweight, settings) live in
Postgres in this mode; the read-only food/nutrient search stays SQLite,
opened read-only from the bundled file — no code path writes to it.

### 2. Frontend project

**Root Directory**: `frontend`. Framework Preset: **Vite** (auto-detected).

Environment variable: `VITE_API_BASE_URL` = the backend project's URL (e.g.
`https://your-backend.vercel.app`) — leave unset for local dev, where Vite's
dev-server proxy handles `/api/*` instead.

### 3. Wire them together

The two projects' URLs aren't known until after each first deploy, so:
deploy both once, then set `VITE_API_BASE_URL` on the frontend project and
`CORS_ORIGINS` on the backend project to each other's real URLs, and redeploy
both.

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
backend/            FastAPI app (routes/), nutrition math (nutrition/), vision providers (vision/)
backend/data/        Bundled read-only reference DB for Vercel deployment (committed)
frontend/            React + Vite + TypeScript + Tailwind
scripts/             Data ingest scripts (USDA, Open Food Facts)
data/                Local dev SQLite DB and downloaded bulk data (gitignored)
tests/               pytest suite
requirements.txt      Generated from pyproject.toml/uv.lock, for Vercel's Python runtime
```
