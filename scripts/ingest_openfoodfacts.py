"""Download and load the Open Food Facts bulk CSV export into the app's
SQLite database, for barcode lookups.

Usage:
    python scripts/ingest_openfoodfacts.py [--db data/app.db] [--workdir data/off_raw] [--skip-download] [--limit N]

No API key required. The export is a public, gzip-compressed, tab-delimited
CSV (~1 GB compressed / ~9 GB uncompressed for the full world dataset), so
this streams the decompressed file row-by-row rather than loading it whole.
Use --limit for a quick local smoke test instead of a full ingest.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import sqlite3
import sys
import urllib.request
from pathlib import Path

from scripts.ingest_usda import create_schema

EXPORT_URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"
USER_AGENT = "Mozilla/5.0 (compatible; nutrition-tracker-ingest/1.0)"
BATCH_SIZE = 2000

# Open Food Facts CSV field -> (canonical column, grams-to-target-unit multiplier).
# OFF stores every nutrient per-100g in grams; USDA-derived canonical units
# (see scripts/ingest_usda.py NUTRIENT_NBR_TO_KEY) use mg/ug for minerals and
# vitamins, so values are converted here to stay consistent across sources.
OFF_FIELD_TO_CANONICAL: dict[str, tuple[str, float]] = {
    "energy-kcal_100g": ("energy_kcal", 1),
    "proteins_100g": ("protein_g", 1),
    "fat_100g": ("fat_g", 1),
    "saturated-fat_100g": ("saturated_fat_g", 1),
    "carbohydrates_100g": ("carbohydrate_g", 1),
    "sugars_100g": ("total_sugars_g", 1),
    "fiber_100g": ("fiber_g", 1),
    "sodium_100g": ("sodium_mg", 1000),
    "calcium_100g": ("calcium_mg", 1000),
    "iron_100g": ("iron_mg", 1000),
    "vitamin-a_100g": ("vitamin_a_rae_ug", 1_000_000),
    "vitamin-d_100g": ("vitamin_d_ug", 1_000_000),
    "vitamin-e_100g": ("vitamin_e_mg", 1000),
    "vitamin-k_100g": ("vitamin_k_ug", 1_000_000),
    "vitamin-c_100g": ("vitamin_c_mg", 1000),
    "vitamin-b1_100g": ("thiamin_mg", 1000),
    "vitamin-b2_100g": ("riboflavin_mg", 1000),
    "vitamin-pp_100g": ("niacin_mg", 1000),
    "vitamin-b6_100g": ("vitamin_b6_mg", 1000),
    "vitamin-b9_100g": ("folate_dfe_ug", 1_000_000),
    "vitamin-b12_100g": ("vitamin_b12_ug", 1_000_000),
}

CANONICAL_COLUMNS = [canonical for canonical, _ in OFF_FIELD_TO_CANONICAL.values()]


def create_off_schema(conn: sqlite3.Connection) -> None:
    columns_sql = ",\n            ".join(f"{col} REAL" for col in CANONICAL_COLUMNS)
    conn.executescript(
        f"""
        CREATE TABLE IF NOT EXISTS off_products (
            barcode TEXT PRIMARY KEY,
            product_name TEXT,
            brands TEXT,
            categories TEXT,
            {columns_sql}
        );
        """
    )
    conn.commit()


def download_file(url: str, dest: Path, force: bool = False) -> Path:
    if dest.exists() and not force:
        print(f"  already downloaded: {dest}")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url} -> {dest}")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(req, timeout=300) as resp, open(tmp, "wb") as f:
        total = int(resp.headers.get("Content-Length", 0))
        written = 0
        while chunk := resp.read(1024 * 1024):
            f.write(chunk)
            written += len(chunk)
            if total:
                print(f"\r  {written / 1e6:.1f} / {total / 1e6:.1f} MB", end="", flush=True)
    print()
    tmp.rename(dest)
    return dest


def _parse_row(row: dict) -> tuple | None:
    barcode = (row.get("code") or "").strip()
    if not barcode:
        return None

    values: dict[str, float | None] = {}
    for off_field, (canonical, multiplier) in OFF_FIELD_TO_CANONICAL.items():
        raw = row.get(off_field)
        values[canonical] = float(raw) * multiplier if raw else None

    return (
        barcode,
        row.get("product_name") or None,
        row.get("brands") or None,
        row.get("categories") or None,
        *[values[col] for col in CANONICAL_COLUMNS],
    )


def load_off_products(conn: sqlite3.Connection, gz_path: Path, limit: int | None = None) -> int:
    placeholders = ", ".join(["?"] * (4 + len(CANONICAL_COLUMNS)))
    insert_sql = f"INSERT OR REPLACE INTO off_products VALUES ({placeholders})"

    count = 0
    batch: list[tuple] = []
    with gzip.open(gz_path, "rt", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            parsed = _parse_row(row)
            if parsed is None:
                continue
            batch.append(parsed)
            count += 1
            if len(batch) >= BATCH_SIZE:
                conn.executemany(insert_sql, batch)
                batch = []
            if limit is not None and count >= limit:
                break
        if batch:
            conn.executemany(insert_sql, batch)
    conn.commit()
    return count


def lookup_barcode(conn: sqlite3.Connection, barcode: str) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    return conn.execute("SELECT * FROM off_products WHERE barcode = ?", (barcode,)).fetchone()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="data/app.db", help="Path to the SQLite database file")
    parser.add_argument("--workdir", default="data/off_raw", help="Directory to download the bulk export into")
    parser.add_argument("--skip-download", action="store_true", help="Reuse an already-downloaded export")
    parser.add_argument("--limit", type=int, default=None, help="Stop after N products (for local smoke tests)")
    args = parser.parse_args(argv)

    workdir = Path(args.workdir)
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    gz_path = workdir / "products.csv.gz"
    if not args.skip_download:
        download_file(EXPORT_URL, gz_path)

    conn = sqlite3.connect(db_path)
    create_schema(conn)  # ensure the shared app.db has the USDA tables too
    create_off_schema(conn)

    print("Loading Open Food Facts products...")
    count = load_off_products(conn, gz_path, limit=args.limit)
    print(f"Done. {count} barcoded products loaded into {db_path}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
