"""Download and load USDA FoodData Central bulk CSV data (Foundation Foods,
SR Legacy, Branded Foods) into the app's SQLite database.

Usage:
    python scripts/ingest_usda.py [--db data/app.db] [--workdir data/usda_raw] [--skip-download]

No API key required — this uses the public bulk CSV downloads from
https://fdc.nal.usda.gov/download-datasets.html, not the rate-limited API.
"""

from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import sys
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urljoin

DOWNLOAD_PAGE_URL = "https://fdc.nal.usda.gov/download-datasets.html"
USER_AGENT = "Mozilla/5.0 (compatible; nutrition-tracker-ingest/1.0)"

# Zip filenames are date-stamped and change on every USDA release, so we
# discover the current URL from the download page rather than hardcoding it.
DATASET_FILENAME_PATTERNS = {
    "foundation": re.compile(r'href="([^"]*FoodData_Central_foundation_food_csv[^"]*\.zip)"'),
    "sr_legacy": re.compile(r'href="([^"]*FoodData_Central_sr_legacy_food_csv[^"]*\.zip)"'),
    "branded": re.compile(r'href="([^"]*FoodData_Central_branded_food_csv[^"]*\.zip)"'),
}

# nutrient_nbr (USDA's stable "nutrient number") -> (canonical key, unit).
# nutrient.csv's internal `id` column is NOT stable across releases and must
# never be hardcoded; it's resolved to nutrient_nbr at ingest time instead.
NUTRIENT_NBR_TO_KEY: dict[str, tuple[str, str]] = {
    "208": ("energy_kcal", "kcal"),
    "203": ("protein_g", "g"),
    "204": ("fat_g", "g"),
    "606": ("saturated_fat_g", "g"),
    "205": ("carbohydrate_g", "g"),
    "291": ("fiber_g", "g"),
    "269": ("total_sugars_g", "g"),
    "307": ("sodium_mg", "mg"),
    "306": ("potassium_mg", "mg"),
    "301": ("calcium_mg", "mg"),
    "303": ("iron_mg", "mg"),
    "304": ("magnesium_mg", "mg"),
    "309": ("zinc_mg", "mg"),
    "317": ("selenium_ug", "ug"),
    "320": ("vitamin_a_rae_ug", "ug"),
    "401": ("vitamin_c_mg", "mg"),
    "328": ("vitamin_d_ug", "ug"),
    "323": ("vitamin_e_mg", "mg"),
    "430": ("vitamin_k_ug", "ug"),
    "404": ("thiamin_mg", "mg"),
    "405": ("riboflavin_mg", "mg"),
    "406": ("niacin_mg", "mg"),
    "415": ("vitamin_b6_mg", "mg"),
    "435": ("folate_dfe_ug", "ug"),
    "418": ("vitamin_b12_ug", "ug"),
    "421": ("choline_mg", "mg"),
    "305": ("phosphorus_mg", "mg"),
    "312": ("copper_mg", "mg"),
    "315": ("manganese_mg", "mg"),
}

# The Foundation Foods bulk download's food.csv includes internal lab
# sample-tracking rows (data_type 'sample_food', 'sub_sample_food',
# 'market_acquisition', 'agricultural_acquisition') alongside the actual
# public-facing foods — these outnumber real foods ~180:1 and must be
# excluded, or the app's food database fills with lab bookkeeping records.
VALID_DATA_TYPES = {"foundation_food", "sr_legacy_food", "branded_food"}

# Since October 2020, Foundation Foods no longer populate nutrient_nbr 208
# (Energy) directly — they only carry the calculated Atwater General Factor
# energy value instead. Rows with this nutrient_nbr are staged separately
# and only used to fill in energy_kcal for foods that have no direct 208 row.
ENERGY_FALLBACK_NBR = "957"

BATCH_SIZE = 2000


def normalize_nutrient_nbr(raw: str) -> str:
    raw = raw.strip()
    if raw.endswith(".0"):
        raw = raw[:-2]
    return raw


def discover_dataset_urls() -> dict[str, str]:
    req = urllib.request.Request(DOWNLOAD_PAGE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    urls: dict[str, str] = {}
    for name, pattern in DATASET_FILENAME_PATTERNS.items():
        match = pattern.search(html)
        if not match:
            raise RuntimeError(
                f"Could not find a download link for dataset '{name}' on {DOWNLOAD_PAGE_URL}. "
                "USDA may have changed the page layout — check it manually."
            )
        href = match.group(1)
        urls[name] = urljoin(DOWNLOAD_PAGE_URL, href)
    return urls


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


def extract_zip(zip_path: Path, dest_dir: Path, force: bool = False) -> Path:
    marker = dest_dir / ".extracted"
    if marker.exists() and not force:
        print(f"  already extracted: {dest_dir}")
        return dest_dir
    dest_dir.mkdir(parents=True, exist_ok=True)
    print(f"  extracting {zip_path} -> {dest_dir}")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest_dir)
    marker.touch()
    return dest_dir


def find_csv(base_dir: Path, filename: str) -> Path:
    matches = list(base_dir.rglob(filename))
    if not matches:
        raise FileNotFoundError(f"{filename} not found under {base_dir}")
    return matches[0]


def open_csv_dict_reader(path: Path):
    f = open(path, "r", encoding="utf-8-sig", newline="")
    try:
        return f, csv.DictReader(f)
    except UnicodeDecodeError:
        f.close()
        f = open(path, "r", encoding="latin-1", newline="")
        return f, csv.DictReader(f)


def build_nutrient_maps(nutrient_csv_path: Path) -> tuple[dict[int, tuple[str, str]], int | None]:
    """Returns (nutrient_id -> (canonical_key, unit), energy_fallback_nutrient_id)."""
    nutrient_map: dict[int, tuple[str, str]] = {}
    energy_fallback_id: int | None = None
    f, reader = open_csv_dict_reader(nutrient_csv_path)
    with f:
        for row in reader:
            nbr = normalize_nutrient_nbr(row["nutrient_nbr"])
            nid = int(row["id"])
            if nbr == ENERGY_FALLBACK_NBR:
                energy_fallback_id = nid
            elif nbr in NUTRIENT_NBR_TO_KEY:
                nutrient_map[nid] = NUTRIENT_NBR_TO_KEY[nbr]
    return nutrient_map, energy_fallback_id


def load_food_category_map(food_category_csv_path: Path) -> dict[int, str]:
    category_map: dict[int, str] = {}
    if not food_category_csv_path.exists():
        return category_map
    f, reader = open_csv_dict_reader(food_category_csv_path)
    with f:
        for row in reader:
            category_map[int(row["id"])] = row["description"]
    return category_map


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS foods (
            fdc_id INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            data_type TEXT NOT NULL,
            food_category TEXT,
            publication_date TEXT,
            brand_owner TEXT,
            gtin_upc TEXT,
            serving_size REAL,
            serving_size_unit TEXT,
            household_serving_fulltext TEXT
        );

        CREATE TABLE IF NOT EXISTS nutrients (
            fdc_id INTEGER NOT NULL REFERENCES foods(fdc_id),
            nutrient_key TEXT NOT NULL,
            amount REAL NOT NULL,
            unit TEXT NOT NULL,
            PRIMARY KEY (fdc_id, nutrient_key)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS foods_fts USING fts5(
            description,
            content='foods',
            content_rowid='fdc_id'
        );
        """
    )
    conn.commit()


def load_foods(conn: sqlite3.Connection, food_csv_path: Path, category_map: dict[int, str]) -> int:
    f, reader = open_csv_dict_reader(food_csv_path)
    count = 0
    batch = []
    with f:
        for row in reader:
            if row["data_type"] not in VALID_DATA_TYPES:
                continue
            category_id = row.get("food_category_id")
            category_name = category_map.get(int(category_id)) if category_id else None
            batch.append(
                (
                    int(row["fdc_id"]),
                    row["description"],
                    row["data_type"],
                    category_name,
                    row.get("publication_date") or None,
                )
            )
            if len(batch) >= BATCH_SIZE:
                _flush_foods(conn, batch)
                count += len(batch)
                batch = []
        if batch:
            _flush_foods(conn, batch)
            count += len(batch)
    conn.commit()
    return count


def _flush_foods(conn: sqlite3.Connection, batch: list[tuple]) -> None:
    conn.executemany(
        """
        INSERT OR IGNORE INTO foods (fdc_id, description, data_type, food_category, publication_date)
        VALUES (?, ?, ?, ?, ?)
        """,
        batch,
    )


def load_branded_details(conn: sqlite3.Connection, branded_food_csv_path: Path) -> int:
    if not branded_food_csv_path.exists():
        return 0
    f, reader = open_csv_dict_reader(branded_food_csv_path)
    count = 0
    batch = []
    with f:
        for row in reader:
            serving_size = row.get("serving_size") or None
            batch.append(
                (
                    row.get("brand_owner") or None,
                    row.get("gtin_upc") or None,
                    float(serving_size) if serving_size else None,
                    row.get("serving_size_unit") or None,
                    row.get("household_serving_fulltext") or None,
                    int(row["fdc_id"]),
                )
            )
            if len(batch) >= BATCH_SIZE:
                _flush_branded(conn, batch)
                count += len(batch)
                batch = []
        if batch:
            _flush_branded(conn, batch)
            count += len(batch)
    conn.commit()
    return count


def _flush_branded(conn: sqlite3.Connection, batch: list[tuple]) -> None:
    conn.executemany(
        """
        UPDATE foods
        SET brand_owner = ?, gtin_upc = ?, serving_size = ?,
            serving_size_unit = ?, household_serving_fulltext = ?
        WHERE fdc_id = ?
        """,
        batch,
    )


def load_nutrients(
    conn: sqlite3.Connection,
    food_nutrient_csv_path: Path,
    nutrient_map: dict[int, tuple[str, str]],
    energy_fallback_id: int | None,
) -> int:
    conn.execute("CREATE TEMP TABLE IF NOT EXISTS _energy_fallback (fdc_id INTEGER, amount REAL, unit TEXT)")

    f, reader = open_csv_dict_reader(food_nutrient_csv_path)
    count = 0
    batch: list[tuple] = []
    fallback_batch: list[tuple] = []
    with f:
        for row in reader:
            nutrient_id = int(row["nutrient_id"])
            amount_raw = row.get("amount")
            if not amount_raw:
                continue
            amount = float(amount_raw)
            fdc_id = int(row["fdc_id"])

            if energy_fallback_id is not None and nutrient_id == energy_fallback_id:
                fallback_batch.append((fdc_id, amount, "kcal"))
                if len(fallback_batch) >= BATCH_SIZE:
                    conn.executemany(
                        "INSERT INTO _energy_fallback (fdc_id, amount, unit) VALUES (?, ?, ?)",
                        fallback_batch,
                    )
                    fallback_batch = []
                continue

            mapped = nutrient_map.get(nutrient_id)
            if mapped is None:
                continue
            key, unit = mapped
            batch.append((fdc_id, key, amount, unit))
            if len(batch) >= BATCH_SIZE:
                _flush_nutrients(conn, batch)
                count += len(batch)
                batch = []

        if batch:
            _flush_nutrients(conn, batch)
            count += len(batch)
        if fallback_batch:
            conn.executemany(
                "INSERT INTO _energy_fallback (fdc_id, amount, unit) VALUES (?, ?, ?)",
                fallback_batch,
            )

    cur = conn.execute(
        """
        INSERT OR IGNORE INTO nutrients (fdc_id, nutrient_key, amount, unit)
        SELECT fdc_id, 'energy_kcal', amount, unit FROM _energy_fallback
        """
    )
    count += cur.rowcount
    conn.execute("DROP TABLE IF EXISTS _energy_fallback")
    conn.commit()
    return count


def _flush_nutrients(conn: sqlite3.Connection, batch: list[tuple]) -> None:
    conn.executemany(
        """
        INSERT OR REPLACE INTO nutrients (fdc_id, nutrient_key, amount, unit)
        VALUES (?, ?, ?, ?)
        """,
        batch,
    )


def prune_orphan_nutrients(conn: sqlite3.Connection) -> int:
    """Remove nutrient rows for fdc_ids that were filtered out of `foods`
    (e.g. Foundation Foods' internal lab sample-tracking records)."""
    cur = conn.execute("DELETE FROM nutrients WHERE fdc_id NOT IN (SELECT fdc_id FROM foods)")
    conn.commit()
    return cur.rowcount


def populate_fts(conn: sqlite3.Connection) -> None:
    # Rebuilt via drop+recreate rather than DELETE FROM: some SQLite builds
    # raise "database disk image is malformed" deleting from a freshly
    # created, never-yet-populated external-content FTS5 table.
    conn.execute("DROP TABLE IF EXISTS foods_fts")
    conn.execute(
        "CREATE VIRTUAL TABLE foods_fts USING fts5(description, content='foods', content_rowid='fdc_id')"
    )
    conn.execute("INSERT INTO foods_fts (rowid, description) SELECT fdc_id, description FROM foods")
    conn.commit()


def search_foods(conn: sqlite3.Connection, query: str, limit: int = 10) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    cur = conn.execute(
        """
        SELECT foods.* FROM foods_fts
        JOIN foods ON foods.fdc_id = foods_fts.rowid
        WHERE foods_fts MATCH ?
        ORDER BY rank
        LIMIT ?
        """,
        (query, limit),
    )
    return cur.fetchall()


def ingest_dataset(conn: sqlite3.Connection, dataset_dir: Path, is_branded: bool) -> None:
    nutrient_map, energy_fallback_id = build_nutrient_maps(find_csv(dataset_dir, "nutrient.csv"))
    category_map = load_food_category_map(next(iter(dataset_dir.rglob("food_category.csv")), Path("/nonexistent")))

    n_foods = load_foods(conn, find_csv(dataset_dir, "food.csv"), category_map)
    print(f"    loaded {n_foods} foods")

    if is_branded:
        branded_csv = next(iter(dataset_dir.rglob("branded_food.csv")), None)
        if branded_csv:
            n_branded = load_branded_details(conn, branded_csv)
            print(f"    updated {n_branded} branded food details")

    n_nutrients = load_nutrients(conn, find_csv(dataset_dir, "food_nutrient.csv"), nutrient_map, energy_fallback_id)
    print(f"    loaded {n_nutrients} nutrient rows")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="data/app.db", help="Path to the SQLite database file")
    parser.add_argument("--workdir", default="data/usda_raw", help="Directory to download/extract bulk CSVs into")
    parser.add_argument("--skip-download", action="store_true", help="Reuse already-downloaded/extracted files")
    args = parser.parse_args(argv)

    workdir = Path(args.workdir)
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    print("Discovering current USDA FoodData Central download URLs...")
    urls = discover_dataset_urls()
    for name, url in urls.items():
        print(f"  {name}: {url}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    create_schema(conn)

    for name, url in urls.items():
        print(f"\n[{name}]")
        zip_path = workdir / f"{name}.zip"
        extract_dir = workdir / name
        if not args.skip_download:
            download_file(url, zip_path)
        extract_zip(zip_path, extract_dir, force=not args.skip_download)
        ingest_dataset(conn, extract_dir, is_branded=(name == "branded"))

    n_pruned = prune_orphan_nutrients(conn)
    if n_pruned:
        print(f"\nPruned {n_pruned} orphan nutrient rows (filtered-out food records)")

    print("Building full-text search index...")
    populate_fts(conn)

    food_count = conn.execute("SELECT COUNT(*) FROM foods").fetchone()[0]
    nutrient_count = conn.execute("SELECT COUNT(*) FROM nutrients").fetchone()[0]
    print(f"\nDone. {food_count} foods, {nutrient_count} nutrient rows in {db_path}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
