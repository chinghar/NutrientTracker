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

## Project layout

```
backend/     FastAPI app (routes/), nutrition math (nutrition/), vision providers (vision/)
frontend/    React + Vite + TypeScript + Tailwind
scripts/     Data ingest scripts (USDA, Open Food Facts)
data/        SQLite DB and downloaded bulk data (gitignored)
tests/       pytest suite
```
