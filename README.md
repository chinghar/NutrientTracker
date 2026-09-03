# Nutrition App

A photo-based nutrition tracking app. Enter body stats and a goal, get daily
calorie/macro/micronutrient targets, then photograph meals to log intake
against them. All user data lives in the browser (IndexedDB) — there is no
server-side database and no environment variables.

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). No `.env` file is needed.

Set up your profile at `/profile` first (this computes your daily targets),
then log meals from `/` (photo, barcode scan, or manual search) and check
`/dashboard` for your daily/7-day view. Bring your own Anthropic API key in
`/settings` for photo analysis, or run Ollama locally.

## Nutrition database

The food database (`public/data/foods.json` and `public/data/foods-search-index.json`)
is **generated once, offline, and committed to the repo** — it is not built at
Vercel build time or fetched from a live API at runtime. This keeps the Vercel
build a no-op for nutrition data and avoids shipping any database or API key.

To regenerate it from the current USDA FoodData Central bulk CSV release:

```bash
pnpm build:fooddb
```

This downloads the USDA Foundation Foods + SR Legacy CSV bulk datasets (public
domain, no API key) into `scripts/.cache/` (gitignored), keeps only those two
data types (~8,000 foods, excluding Branded Foods), prunes to ~28 core
nutrients, and writes:

- `public/data/foods.json` — compact parallel-array food + nutrient data
- `public/data/foods-search-index.json` — a prebuilt MiniSearch index

Both generated files **are committed deliberately**. You normally don't need
to run this script — only re-run it if you want to refresh the dataset from a
newer USDA release.

Packaged/branded foods and barcode lookups are resolved at runtime directly
against the [Open Food Facts](https://world.openfoodfacts.org) public API from
the browser (no key, no proxy — its CORS headers allow direct browser calls).

## Deploying

Import this repo into [Vercel](https://vercel.com/new) and click **Deploy**.
No configuration is needed: no `vercel.json`, no environment variables, no
custom build/output settings. Vercel's standard Next.js auto-detection is
sufficient.

## Testing

```bash
pnpm test
```

All nutrition math (targets, calibration, etc.) is written as pure,
unit-tested functions, run with [Vitest](https://vitest.dev).
