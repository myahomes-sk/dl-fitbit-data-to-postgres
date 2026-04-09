# 🏃 Fitbit Data — Local SQL Analytics

A fully offline, Docker-powered Postgres database built from your personal Fitbit export. Ingest years of health telemetry into a local SQL database and query it however you like — no cloud account needed, no row limits.

---

## 📦 What This Does

- Spins up a local **Postgres 15** database via Docker
- Reads all your Fitbit CSV export files
- Consolidates them into **104 clean SQL tables** (multi-file metrics like heart rate are stitched into one table per metric)
- Lets you write unlimited SQL queries entirely offline

---

## 🚀 Quick Start

### Step 1 — Get Your Fitbit Data

1. Go to **[Google Takeout → Fitbit](https://takeout.google.com/settings/takeout/custom/fitbit?pli=1)**
2. Make sure only **Fitbit** is selected, then click **Next step → Create export**
3. Download the `.zip` file when it's ready (Google will email you)
4. Extract the zip — you'll find a folder structure like:

```
Takeout/
  Fitbit/
    Heart Rate/
    Sleep/
    Active Zone Minutes (AZM)/
    ... (30+ folders)
```

5. Copy **all the folders inside `Fitbit/`** directly into the root of this cloned repo, so it looks like:

```
dl-fitbit-data/
  Heart Rate/           ← pasted here
  Sleep/                ← pasted here
  Active Zone Minutes/  ← pasted here
  ...
  setup.sh
  auto_migrate.js
  docker-compose.yml
```

---

### Step 2 — Run Setup

```bash
bash setup.sh
```

This script will automatically:
- ✅ Install **Docker** if not found (Linux only, requires sudo)
- ✅ Install **Node.js** if not found
- ✅ Copy `.env.example` → `.env` with local database credentials
- ✅ Pull and start the **Postgres 15** Docker container
- ✅ Install Node package dependencies

---

### Step 3 — Migrate Your Data

```bash
node auto_migrate.js
```

This will scan all your Fitbit folders, automatically detect column types, and load everything into the local database. Depending on how many years of data you have, this can take **5–20 minutes**.

You'll see output like:

```
⏳ Processing Active Zone Minutes - 2022-01-01.csv -> table: active_zone_minutes
   ✅ Migrated 507 rows into "active_zone_minutes"

⏳ Processing estimated_oxygen_variation-2022-01-02.csv -> table: estimated_oxygen_variation
   ✅ Migrated 448 rows into "estimated_oxygen_variation"

🎉 Universal Migration complete!
```

---

## 🗄️ Connecting to the Database

### Option 1 — Terminal (psql via Docker, no install needed)

```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db
```

Once inside, try:

```sql
-- List all tables
\dt

-- See all tables with row counts
SELECT relname AS table, n_live_tup AS rows
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Exit
\q
```

### Option 2 — GUI Client (TablePlus, DBeaver, DataGrip, etc.)

Use these connection details:

| Setting  | Value         |
|----------|---------------|
| Host     | `localhost`   |
| Port     | `5432`        |
| Database | `fitbit_db`   |
| Username | `fitbit_user` |
| Password | `fitbit_pass` |

---

## 📊 Example SQL Queries

### Average resting heart rate per month
```sql
SELECT
  DATE_TRUNC('month', datetime) AS month,
  ROUND(AVG(bpm)::numeric, 1) AS avg_bpm
FROM heart_rate
GROUP BY 1
ORDER BY 1;
```

### Daily step count over the last 90 days
```sql
SELECT
  DATE(datetime) AS day,
  SUM(steps) AS total_steps
FROM steps
WHERE datetime >= NOW() - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1;
```

### Sleep duration trend by month
```sql
SELECT
  creation_date,
  sleep_type,
  ROUND(sleep_duration::numeric, 2) AS hours,
  ROUND(deep_sleep::numeric, 1) AS deep_pct,
  ROUND(rem_sleep::numeric, 1) AS rem_pct
FROM sleep_profiles
ORDER BY creation_date DESC;
```

### Heart rate variability trend
```sql
SELECT
  DATE_TRUNC('month', timestamp) AS month,
  ROUND(AVG(rmssd)::numeric, 1) AS avg_rmssd
FROM heart_rate_variability
GROUP BY 1
ORDER BY 1;
```

---

## 🗂️ Key Tables

| Table | Description |
|-------|-------------|
| `heart_rate` | Per-minute heart rate (~42M rows) |
| `steps` | Per-minute step counts |
| `calories` | Per-minute calorie burn |
| `active_zone_minutes` | Active zone minutes by type |
| `estimated_oxygen_variation` | SpO2 variation across nights |
| `device_temperature` | Wrist skin temperature |
| `body_temperature` | Core body temperature |
| `heart_rate_variability` | HRV per measurement |
| `sleep_profiles` | Monthly sleep profile summaries |
| `usersleepstages` | Per-night sleep staging |
| `oxygen_saturation` | Blood oxygen saturation |
| `distance` | Per-minute distance covered |

---

## 🔄 Managing the Database

### Stop the database
```bash
docker compose down
```

### Start it again later
```bash
docker compose up -d
```

### Re-run migration (safe — won't duplicate data)
```bash
node auto_migrate.js
```

> The script uses `DROP TABLE IF EXISTS` before creating each table, so re-running it is safe and idempotent — it will simply rebuild from scratch.

---

## 📁 Project Structure

```
dl-fitbit-data/
├── setup.sh            # Smart setup script (installs deps, starts DB)
├── auto_migrate.js     # Universal CSV → Postgres ingestion script
├── migrate.js          # Legacy script (Sleep + Heart Rate only)
├── docker-compose.yml  # Postgres 15 container definition
├── package.json        # Node.js dependencies
├── .env.example        # Environment variable template
├── .gitignore          # Excludes data folders, .env, .db_data
└── README.md           # This file
```

---

## ⚠️ Notes

- **Data not included** — The Fitbit CSV folders are excluded from git (they're personal health data). See Step 1 to get your own.
- **`.env` is excluded** — Never commit your `.env` file. Use `.env.example` as a reference.
- **Local only** — The database runs fully offline. No cloud, no limits.
- **Re-cloning** — If you clone to a new machine, just repeat Steps 1–3. The migration takes a few minutes to rebuild.
