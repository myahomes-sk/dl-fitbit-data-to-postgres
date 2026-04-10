# 🏃 Fitbit Data — Local SQL Analytics

A fully offline, Docker-powered Postgres database built from your personal Fitbit export. Ingest years of health telemetry into a local SQL database and query it however you like — no cloud account needed, no row limits.

---

## 📦 What This Does

- Spins up a local **Postgres 15** database via Docker
- Reads all your Fitbit CSV export files
- Consolidates them into **104 clean SQL tables** (multi-file metrics like heart rate are stitched into one table per metric)
- Lets you write unlimited SQL queries entirely offline

---

## 💻 Compatibility

| Platform | Supported |
|----------|-----------|
| macOS (Intel + Apple Silicon) | ✅ |
| Linux (Ubuntu / Debian) | ✅ |
| Windows (WSL2) | ⚠️ Mostly works — run `bash setup.sh` inside WSL2 |

> The `setup.sh` script auto-detects your OS. On **macOS** it uses Homebrew to install dependencies. On **Linux** it uses apt/get.docker.com.

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

This script automatically detects **macOS or Linux** and will:
- ✅ Install **Docker** if not found
  - *macOS*: via Homebrew (`brew install --cask docker`) or prompts you to install Docker Desktop
  - *Linux*: via `get.docker.com` (requires sudo)
- ✅ Install **Node.js** if not found
  - *macOS*: via Homebrew (`brew install node`)
  - *Linux*: via NodeSource apt repository
- ✅ Copy `.env.example` → `.env` with local database credentials
- ✅ Pull and start the **Postgres 15** Docker container
- ✅ Install Node package dependencies

> **macOS users**: If you don't have Homebrew, install it first from [brew.sh](https://brew.sh), or manually install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [Node.js](https://nodejs.org/en/download) before running `setup.sh`.

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

🎉 Universal Migration complete!
```

---

### Step 4 — Set Up Ongoing API Sync

The CSV export is a one-time snapshot. To keep your database up to date with fresh data, connect it to the Fitbit API.

#### 4a. Register a Fitbit Developer App (one time)

1. Go to **[dev.fitbit.com/apps/new](https://dev.fitbit.com/apps/new)**
2. Fill in:
   - **Application Type:** `Personal` ← required for intraday heart rate data
   - **Redirect URI:** `http://localhost:8000/callback`
3. Copy your **Client ID** and **Client Secret** into `.env`

#### 4b. Authorize your account (one time per machine)

```bash
node fitbit_auth.js
```

This opens your browser, asks you to log in to Fitbit, then automatically saves your `ACCESS_TOKEN` and `REFRESH_TOKEN` to `.env`. Tokens are automatically refreshed on every subsequent sync.

#### 4c. Run the sync

```bash
node sync.js
```

The sync is **self-aware** — for each metric it checks the latest timestamp already in your local database and fetches only newer data from the Fitbit API. It works correctly no matter where you are:

| Scenario | Behavior |
|---|---|
| Your DB (data up to Apr 6) | Syncs Apr 7 → today |
| Fresh DB (no data) | Syncs last 30 days via API |
| Another team member's DB | Syncs from wherever their data ends |

Tokens auto-refresh so you never need to re-run `fitbit_auth.js` unless you revoke access.

#### 4d. Schedule daily sync via cron (optional)

```bash
# Run sync.js every day at 7am
0 7 * * * cd /path/to/dl-fitbit-data && node sync.js >> sync.log 2>&1
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

## 📊 Running Queries

You can run any SQL query as a one-liner directly from your terminal — no need to enter the interactive shell. Just replace the SQL inside the `-c "..."` flag.

### 📋 Explore your data

**List all tables with row counts:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT relname AS table_name, n_live_tup AS row_count FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
```

**See the columns of a specific table:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "\d heart_rate"
```

**Preview the first 5 rows of any table:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT * FROM steps LIMIT 5;"
```

---

### ❤️ Heart Rate

**Average resting heart rate per month:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT DATE_TRUNC('month', datetime) AS month, ROUND(AVG(bpm)::numeric, 1) AS avg_bpm FROM heart_rate GROUP BY 1 ORDER BY 1;"
```

**Highest ever recorded heart rate:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT datetime, bpm FROM heart_rate ORDER BY bpm DESC LIMIT 10;"
```

---

### 🚶 Steps

**Daily step count over the last 90 days:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT DATE(datetime) AS day, SUM(steps) AS total_steps FROM steps WHERE datetime >= NOW() - INTERVAL '90 days' GROUP BY 1 ORDER BY 1;"
```

**Best step days ever:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT DATE(datetime) AS day, SUM(steps) AS total_steps FROM steps GROUP BY 1 ORDER BY 2 DESC LIMIT 10;"
```

---

### 😴 Sleep

**Monthly sleep profile summary:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT creation_date, sleep_type, ROUND(sleep_duration::numeric, 2) AS hours, ROUND(deep_sleep::numeric, 1) AS deep_pct, ROUND(rem_sleep::numeric, 1) AS rem_pct FROM sleep_profiles ORDER BY creation_date DESC LIMIT 12;"
```

---

### 💓 Heart Rate Variability (HRV)

**Monthly average HRV (RMSSD):**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT DATE_TRUNC('month', timestamp) AS month, ROUND(AVG(rmssd)::numeric, 1) AS avg_rmssd FROM heart_rate_variability GROUP BY 1 ORDER BY 1;"
```

---

### 🌡️ Temperature

**Average wrist temperature by month:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT DATE_TRUNC('month', datetime) AS month, ROUND(AVG(temperature_celsius)::numeric, 2) AS avg_temp_c FROM device_temperature GROUP BY 1 ORDER BY 1;"
```

---

### 🔥 Calories

**Total calories burned per week:**
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT DATE_TRUNC('week', datetime) AS week, ROUND(SUM(calorie)::numeric, 0) AS total_calories FROM calories GROUP BY 1 ORDER BY 1 DESC LIMIT 20;"
```

---

> **Tip:** You can also enter the interactive shell for longer queries:
> ```bash
> docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db
> ```
> Then type your SQL freely and exit with `\q`.

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
