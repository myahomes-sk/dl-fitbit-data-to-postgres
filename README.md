# 🏃 Fitbit Health Analytics — Local SQL + Grafana Dashboard

A fully offline, Docker-powered Postgres database built from your personal Fitbit export — with a live Grafana dashboard, smart Fitbit API sync, and pre-built SQL analytics views.

- **No cloud account needed. No row limits. No subscription.**
- Works on macOS and Linux. A PST colleague can clone and run it on data from an IST user — it just works.

---

## 📦 What This Repo Gives You

| Feature | Details |
|---|---|
| 🗄️ **Offline Postgres DB** | 104 SQL tables from your Fitbit CSV export |
| 🔄 **Smart API Sync** | `sync.js` — incremental, timezone-safe, 9 metrics |
| 📊 **Grafana Dashboard** | 12 auto-provisioned panels, zero config |
| 👁️ **Analytics Views** | `sleep_nightly`, `heart_rate_daily`, `steps_daily`, `weekly_summary` |
| 🔐 **OAuth Flow** | `fitbit_auth.js` — zero-dependency, one-time browser login |

---

## 💻 Compatibility

| Platform | Supported |
|---|---|
| macOS (Intel + Apple Silicon) | ✅ |
| Linux (Ubuntu / Debian) | ✅ |
| Windows (WSL2) | ⚠️ Run `bash setup.sh` inside WSL2 |

---

## 🚀 Getting Started (New User Checklist)

### Step 1 — Get Your Fitbit Data

1. Go to **[Google Takeout → Fitbit](https://takeout.google.com/settings/takeout/custom/fitbit?pli=1)**
2. Select only **Fitbit**, click **Next → Create export**
3. Download and extract the `.zip` — you'll see folders like `Heart Rate/`, `Sleep/`, etc.
4. Copy **all the folders inside `Fitbit/`** into the root of this repo:

```
dl-fitbit-data/
  Heart Rate/           ← paste here
  Sleep/                ← paste here
  Active Zone Minutes/  ← paste here
  ...
  setup.sh
  docker-compose.yml
```

---

### Step 2 — Run Setup

```bash
bash setup.sh
```

Auto-detects macOS or Linux and installs Docker + Node.js if missing, copies `.env.example` → `.env`, and starts the Postgres container.

> **macOS**: Install [Homebrew](https://brew.sh) first if you don't have it.

---

### Step 3 — Migrate CSV Data

```bash
node auto_migrate.js
```

Scans all your Fitbit folders, detects column types, and loads everything into the local DB. Takes **5–20 minutes** depending on years of data. Output looks like:

```
⏳ Processing Heart Rate/2026-02-01.csv -> table: heart_rate
   ✅ Migrated 14400 rows into "heart_rate"
🎉 Universal Migration complete!
```

---

### Step 4 — Open the Grafana Dashboard

```bash
docker compose up -d
```

Then open: **[http://localhost:3000](http://localhost:3000)**

```
Username: admin
Password: fitbit_admin
```

The **Fitbit Health Dashboard** loads automatically as the home page with 12 panels showing all your health metrics. Use the date range picker (top right) to zoom into any time window.

> Docker starts both Postgres (port 5432) and Grafana (port 3000). Both restart automatically when your machine reboots.

---

### Step 5 — Connect to the Fitbit API (Keep Data Fresh)

The CSV export is a one-time snapshot. To sync new data daily:

#### 5a. Register a Fitbit Developer App (one time)

1. Go to **[dev.fitbit.com/apps/new](https://dev.fitbit.com/apps/new)**
2. Fill in:
   - **Application Type:** `Personal` ← required for intraday heart rate data
   - **Redirect URI:** `http://localhost:8000/callback`
3. Copy your **Client ID** and **Client Secret** into `.env`:

```env
FITBIT_CLIENT_ID="your_client_id"
FITBIT_CLIENT_SECRET="your_client_secret"
```

#### 5b. Authorize your account (one time per machine)

```bash
node fitbit_auth.js
```

Opens your browser, you log in to Fitbit, and tokens are saved to `.env` automatically. You never need to repeat this unless you revoke access.

#### 5c. Run the sync

```bash
node sync.js
```

Output:
```
Using Fitbit wearer timezone: Asia/Kolkata
🔄 Starting smart Fitbit sync...

🚶 Steps: syncing from 2026-04-07 to 2026-04-10
   ✅ Inserted 0 new step records

😴 Sleep: syncing from 2026-04-07 to 2026-04-10
   ✅ Inserted 141 new sleep stage records from 6 sessions

⚡ Active Zone Minutes: syncing from 2026-04-09 to 2026-04-10
   ✅ Inserted 10 new AZM records

🎉 Sync complete!
```

**The sync is self-aware** — it checks the latest timestamp in your local DB for each metric and fetches only the missing data:

| Scenario | Behavior |
|---|---|
| DB has data up to Apr 6 | Syncs Apr 7 → today |
| Fresh DB with no API data | Syncs last 30 days |
| Team member's DB (older) | Picks up exactly from where their data ends |

#### 5d. Schedule daily auto-sync (optional)

Run the installer script — it adds the cron job automatically and won't add duplicates if you run it again:

```bash
bash scripts/install_cron.sh
```

Output:
```
✅ Cron job installed successfully!

   Schedule: Every day at 7:00 AM
   Script:   /path/to/dl-fitbit-data/scripts/daily_sync.sh
   Logs:     /path/to/dl-fitbit-data/logs/sync.log
```

**Verify it was installed:**
```bash
crontab -l
# 0 7 * * * /path/to/dl-fitbit-data/scripts/daily_sync.sh
```

**Watch the log live:**
```bash
tail -f logs/sync.log
```

**Remove the cron job:**
```bash
crontab -l | grep -v 'daily_sync.sh' | crontab -
```

> **Note:** If `docker compose` is not running at 7am, the sync skips silently — it does NOT try to start Docker automatically. Run `docker compose up -d` to bring everything back up, and the next morning's cron will work normally.

---

## 📊 Metrics Synced

| Metric | Source | Table |
|---|---|---|
| 🚶 Steps | Intraday 1-min | `steps` |
| ❤️ Heart Rate | Intraday 1-sec | `heart_rate` |
| 🔥 Calories | Intraday 1-min | `calories` |
| 📍 Distance | Intraday 1-min | `distance` |
| 😴 Sleep Stages | Session-based | `usersleepstages` |
| ⚡ Active Zone Minutes | Daily | `active_zone_minutes` |
| 🫁 SpO2 | Minutely | `oxygen_saturation` |
| 💓 HRV (RMSSD) | Minutely | `heart_rate_variability` |
| 🌡️ Skin Temperature | Nightly | `device_temperature` |

---

## 📊 Grafana Dashboard Panels

The dashboard at **[http://localhost:3000](http://localhost:3000)** has 12 pre-built panels, grouped into sections:

| Section | Panels |
|---|---|
| 📊 Today's Summary | Steps today · Avg HR (7d) · Last night's sleep · Latest HRV |
| ❤️ Heart Rate | Daily min/avg/max BPM time series |
| 🚶 Activity | Daily steps bar chart · Daily calories burned |
| 😴 Sleep | Nightly sleep hours · Sleep stage breakdown (Deep/REM/Light/Awake) |
| 💓 HRV & Temperature | Daily RMSSD trend · Nightly skin temperature |
| 📅 Weekly Summary | Avg steps + avg BPM per week |

**Date range**: Use the picker (top right) to zoom into any period. Dashboard auto-refreshes every 5 minutes.

---

## 🛠️ Adding New Panels & Queries to Grafana

### Step 1 — Open the dashboard editor

1. Go to **[http://localhost:3000](http://localhost:3000)**
2. Open the **Fitbit Health Dashboard**
3. Click **Edit** (top right) → then **Add → Visualization**

### Step 2 — Write your SQL query

Select **FitbitDB** as the datasource, switch to **Code** mode, and write your SQL.

**Key rules for Grafana SQL:**

| Requirement | How to do it |
|---|---|
| Time column must be named `time` | Alias it: `SELECT day AS "time"` |
| Time column must be `timestamptz` | Cast if needed: `day::timestamptz` |
| Filter by the dashboard's date range | Use `$__timeFilter(column)` macro |
| Group time into buckets | Use `DATE_TRUNC('day', column)` |

**Grafana macros available:**

```sql
$__timeFilter(timestamp)          -- WHERE timestamp BETWEEN dashboard_start AND dashboard_end
$__timeFrom()                     -- the start of the current date range
$__timeTo()                       -- the end of the current date range
```

### Step 3 — Example queries you can add

**Weekly step goal progress (% of 10,000 steps):**
```sql
SELECT
  day::timestamptz AS "time",
  ROUND((total_steps / 10000.0 * 100)::numeric, 1) AS "Goal %"
FROM steps_daily
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY day
```

**Resting heart rate trend (7-day rolling average):**
```sql
SELECT
  day::timestamptz AS "time",
  ROUND(AVG(avg_bpm) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)::numeric, 1) AS "7d Avg BPM"
FROM heart_rate_daily
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY day
```

**Sleep efficiency (deep + REM as % of total):**
```sql
SELECT
  night::timestamptz AS "time",
  ROUND(((deep_min + rem_min) * 100.0 / NULLIF(total_hours * 60, 0))::numeric, 1) AS "Quality %"
FROM sleep_nightly
WHERE night BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY night
```

**Active Zone Minutes by zone type:**
```sql
SELECT
  DATE(date_time AT TIME ZONE 'UTC')::timestamptz AS "time",
  SUM(CASE WHEN heart_zone_id = 'FAT_BURN' THEN total_minutes ELSE 0 END) AS "Fat Burn",
  SUM(CASE WHEN heart_zone_id = 'CARDIO'   THEN total_minutes ELSE 0 END) AS "Cardio",
  SUM(CASE WHEN heart_zone_id = 'PEAK'     THEN total_minutes ELSE 0 END) AS "Peak"
FROM active_zone_minutes
WHERE $__timeFilter(date_time)
GROUP BY 1 ORDER BY 1
```

### Step 4 — Choose the right panel type

| Panel type | Best for |
|---|---|
| **Time series** | Trends over time (heart rate, HRV, sleep) |
| **Bar chart** | Daily totals (steps, calories, AZM) |
| **Stat** | Single current value (today's steps, last sleep) |
| **Gauge** | Progress toward a target (step goal %) |
| **Bar gauge** | Comparing values side by side |
| **Table** | Showing raw rows with multiple columns |

### Step 5 — Save changes back to the provisioned file

> ⚠️ Grafana dashboards loaded from files are **read-only by default** in the UI. To persist your changes so they survive a container restart:

1. After editing, click **Save dashboard** → copy the JSON by going to **Dashboard settings → JSON Model**
2. Replace the contents of `grafana/provisioning/dashboards/fitbit_health.json` with the copied JSON
3. Commit and push:

```bash
git add grafana/provisioning/dashboards/fitbit_health.json
git commit -m "feat: add [your panel name] panel to Grafana dashboard"
git push origin master
```

Next time anyone runs `docker compose up -d`, they'll get your updated dashboard automatically.

> **Tip:** To allow free editing in the UI without the read-only restriction, set `allowUiUpdates: true` in `grafana/provisioning/dashboards/provider.yml` — this is already enabled in this repo.

---

## 🗄️ Connecting to the Database

### Terminal (no install needed)

```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db
```

Once inside:
```sql
\dt                  -- list all tables
\d heart_rate        -- see columns of a table
SELECT * FROM steps LIMIT 5;
\q                   -- exit
```

### GUI Client (TablePlus, DBeaver, DataGrip)

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `fitbit_db` |
| Username | `fitbit_user` |
| Password | `fitbit_pass` |

---

## 🧠 Pre-Built Analytics Views

These views handle all the tricky logic (timezone conversion, source deduplication, session filtering) for you:

### `sleep_nightly` — Correct nightly sleep attribution

Handles IST/UTC timezone correctly, filters naps, prefers API data over CSV where overlap exists.

```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT night, total_hours, deep_min, rem_min, light_min FROM sleep_nightly ORDER BY night DESC LIMIT 7;"
```

### `heart_rate_daily` — Daily HR summary

```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT day, min_bpm, avg_bpm, max_bpm FROM heart_rate_daily ORDER BY day DESC LIMIT 7;"
```

### `steps_daily` — Daily step totals

```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT day, total_steps, active_minutes FROM steps_daily ORDER BY day DESC LIMIT 7;"
```

### `weekly_summary` — Week-over-week health overview

```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT week, avg_daily_steps, avg_resting_bpm, avg_daily_calories FROM weekly_summary LIMIT 8;"
```

---

## 📋 Useful One-Liner Queries

### All tables with row counts
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT relname AS table_name, n_live_tup AS row_count FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
```

### 7-day sleep average
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT ROUND(AVG(total_hours)::numeric,2) AS avg_hrs, ROUND(AVG(deep_min)::numeric,1) AS avg_deep, ROUND(AVG(rem_min)::numeric,1) AS avg_rem FROM sleep_nightly WHERE night >= CURRENT_DATE - 7;"
```

### Heart rate trend (monthly avg)
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT DATE_TRUNC('month', day) AS month, ROUND(AVG(avg_bpm)::numeric,1) AS avg_bpm FROM heart_rate_daily GROUP BY 1 ORDER BY 1 DESC LIMIT 12;"
```

### HRV 30-day trend
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT DATE_TRUNC('day', timestamp)::date AS day, ROUND(AVG(root_mean_square_of_successive_differences_milliseconds)::numeric,1) AS rmssd FROM heart_rate_variability WHERE timestamp >= NOW() - INTERVAL '30 days' GROUP BY 1 ORDER BY 1;"
```

### Active Zone Minutes last 30 days
```bash
docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db -c \
  "SELECT DATE(date_time) AS day, heart_zone_id, total_minutes FROM active_zone_minutes WHERE date_time >= NOW() - INTERVAL '30 days' ORDER BY day DESC, heart_zone_id;"
```

---

## 🗂️ Key Tables

| Table | Description |
|---|---|
| `heart_rate` | Per-minute heart rate (intraday, ~42M+ rows) |
| `steps` | Per-minute step counts |
| `calories` | Per-minute calorie burn |
| `distance` | Per-minute distance |
| `active_zone_minutes` | AZM by zone type (Fat Burn / Cardio / Peak) |
| `usersleepstages` | Per-night sleep stage data |
| `oxygen_saturation` | SpO2 minutely readings |
| `device_temperature` | Nightly wrist skin temperature |
| `heart_rate_variability` | HRV (RMSSD) per reading |
| `sleep_nightly` *(view)* | Clean nightly sleep summary |
| `heart_rate_daily` *(view)* | Daily HR min/avg/max |
| `steps_daily` *(view)* | Daily step totals |
| `weekly_summary` *(view)* | Week-over-week averages |

---

## 🔄 Managing Containers

```bash
# Start everything (Postgres + Grafana)
docker compose up -d

# Stop everything
docker compose down

# Restart everything after reboot
docker compose up -d

# View Grafana logs
docker logs fitbit-grafana

# View Postgres logs
docker logs fitbit-postgres

# Re-run migration (safe — rebuilds tables from CSV)
node auto_migrate.js

# Sync latest data from Fitbit API
node sync.js

# Check the daily sync log (live tail)
tail -f logs/sync.log

# View installed cron job
crontab -l

# Remove the cron job
crontab -l | grep -v 'daily_sync.sh' | crontab -
```

---

## 📁 Project Structure

```
dl-fitbit-data/
├── setup.sh                    # Smart setup (installs Docker + Node, starts DB)
├── auto_migrate.js             # Universal CSV → Postgres ingestion
├── fitbit_auth.js              # One-time OAuth2 login (saves tokens to .env)
├── sync.js                     # Smart incremental API sync (9 metrics)
├── docker-compose.yml          # Postgres 15 + Grafana 10.4 containers
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── fitbit.yml      # Auto-connects Grafana → Postgres
│       └── dashboards/
│           ├── provider.yml    # Dashboard file loader config
│           └── fitbit_health.json  # 12-panel health dashboard
├── package.json
├── .env.example                # Environment variable template
├── .gitignore                  # Excludes data folders, .env, .db_data
└── README.md
```

---

## ⚙️ Environment Variables (`.env`)

Copy `.env.example` → `.env` and fill in:

```env
# Local Postgres (pre-filled, don't change)
DATABASE_URL="postgresql://fitbit_user:fitbit_pass@localhost:5432/fitbit_db"

# Timezone of the Fitbit WEARER (not the machine running the script)
# Used for correct sleep date attribution — leave as-is unless it's your own data
FITBIT_USER_TIMEZONE="Asia/Kolkata"

# Fitbit API credentials — from dev.fitbit.com/apps/new
FITBIT_CLIENT_ID="your_client_id"
FITBIT_CLIENT_SECRET="your_client_secret"

# Auto-managed by fitbit_auth.js — do not edit manually
FITBIT_ACCESS_TOKEN=""
FITBIT_REFRESH_TOKEN=""
```

> **Important:** `.env` is gitignored. Never commit it — it contains your personal API credentials.

---

## ⚠️ Notes & Known Limitations

- **Data not included** — Fitbit CSV folders are gitignored. See Step 1 to get your own via Google Takeout.
- **Fitbit API deprecation** — The legacy Fitbit Web API will be deprecated in **September 2026**. A migration to the Google Health API will be needed before then.
- **Rate limiting** — Fitbit API limits intraday data to 150 requests/hour. If a backfill hits the limit, just re-run `node sync.js` — it picks up where it left off.
- **SpO2 availability** — Returns 404 if your device didn't record SpO2 on those dates. Not an error.
- **Sleep timezone** — All sleep queries use `FITBIT_USER_TIMEZONE` for correct date attribution. A colleague in PST running the sync should leave this as your timezone (IST) since it's your data.

---

## 🧩 Codebase Internals

### Migration Pipeline

| Script | Scope | Behavior |
|---|---|---|
| `auto_migrate.js` | All CSV folders (recursive) | **Destructive** — `DROP TABLE IF EXISTS CASCADE` then recreate. Infers schema per column (NUMERIC / TIMESTAMPTZ / TEXT). Batches inserts at 500 rows. Strips date suffixes from filenames to consolidate monthly CSVs into single tables (e.g. `heart_rate_2026_02.csv` → `heart_rate`) |
| `migrate.js` | `Heart Rate Notifications Alerts.csv` + `Sleep Profile.csv` only | Non-destructive — `ON CONFLICT DO NOTHING`. Creates `heart_rate_alerts` and `sleep_profiles` tables. Legacy script, superseded by `auto_migrate.js` |
| `migrate_hrv.js` | `Heart Rate Variability/` folder only | Same logic as `auto_migrate.js` but scoped to HRV. Was needed before `auto_migrate.js` excluded HRV from `IGNORE_DIRS` |

### Sync Engine (`sync.js`)

**9 metrics** synced incrementally. Each checks `MAX(date_column)` in its target table to find the gap start:

| Metric | API Endpoint | Intraday | Range Limit | Table | Date Column |
|---|---|---|---|---|---|
| Steps | `/activities/steps/date/{d}/1d/1min` | 1-min | 1 day/req | `steps` | `timestamp` |
| Heart Rate | `/activities/heart/date/{d}/1d/1sec` | 1-sec | 1 day/req | `heart_rate` | `timestamp` |
| Calories | `/activities/calories/date/{d}/1d/1min` | 1-min | 1 day/req | `calories` | `timestamp` |
| Distance | `/activities/distance/date/{d}/1d/1min` | 1-min | 1 day/req | `distance` | `timestamp` |
| Sleep | `/1.2/user/-/sleep/date/{start}/{end}` | session | 100 days | `usersleepstages` | `sleep_stage_start` |
| AZM | `/activities/active-zone-minutes/date/{start}/{end}` | daily | no limit | `active_zone_minutes` | `date_time` |
| SpO2 | `/spo2/date/{start}/{end}/minutely` | 1-min | 30 days | `oxygen_saturation` | `timestamp` |
| HRV | `/hrv/date/{start}/{end}` | 1-min | 30 days | `heart_rate_variability` | `timestamp` |
| Temperature | `/temp/skin/date/{start}/{end}` | nightly | 30 days | `device_temperature` | `recorded_time` |

**Key behaviors:**

- **Token auto-refresh** — On 401, automatically refreshes `FITBIT_ACCESS_TOKEN` using refresh token and persists both to `.env`
- **Rate limit handling** — On 429, stops the current metric and moves on. Re-run picks up where it left off
- **Sleep dedup** — Deletes existing `Fitbit API` rows by `sleep_id` before re-inserting, preventing duplicates from re-runs
- **Zero-value filtering** — Steps, calories, and distance skip rows where `value === 0`
- **Fallback** — If a table has no data yet, syncs the last 30 days as starting point

### OAuth Flow (`fitbit_auth.js`)

- Spins up `http://localhost:8000/callback`
- Opens browser to Fitbit OAuth2 authorize URL
- Exchanges auth code for access + refresh tokens
- Writes tokens to `.env` via regex replacement
- Scopes: `activity`, `heartrate`, `sleep`, `oxygen_saturation`, `respiratory_rate`, `temperature`, `profile`

### Cron & Logging

- `scripts/daily_sync.sh` — Checks Docker Postgres is running (skips if down), runs `node sync.js`, logs to `logs/sync.log`, rotates to 500 lines
- `scripts/install_cron.sh` — Idempotent crontab installer (`0 7 * * *`), won't add duplicates
- `setup.sh` — Full bootstrap: installs Docker + Node (Linux/macOS), copies `.env.example` → `.env`, starts Postgres, runs `npm install`

### Database Views

Pre-built analytics views handle timezone conversion, source deduplication, and session filtering:

| View | Description |
|---|---|
| `sleep_nightly` | Nightly sleep attribution with correct IST/UTC handling, nap filtering, API/CSV dedup |
| `heart_rate_daily` | Daily min/avg/max BPM aggregation |
| `steps_daily` | Daily step totals with active minutes |
| `weekly_summary` | Week-over-week averages (steps, HR, calories) |

### Dependency Notes

- `@supabase/supabase-js` — **Vestigial**. All DB access uses `postgres` package directly. Supabase was the original cloud backend; migrated to local Postgres. Safe to remove if no code imports it
- `postgres` (v3.4.9) — Primary DB driver. Used by all migration and sync scripts
- `csv-parser` — Used by `auto_migrate.js`, `migrate.js`, `migrate_hrv.js`
- `dotenv` — Loads `.env` in all scripts

### Infrastructure

| Service | Image | Port | Credentials |
|---|---|---|---|
| Postgres | `postgres:15-alpine` | 5432 | `fitbit_user` / `fitbit_pass` / `fitbit_db` |
| Grafana | `grafana/grafana:10.4.18` | 3000 | `admin` / `fitbit_admin` |

- Grafana home dashboard: `fitbit_health.json` (12 panels, auto-refresh 5m)
- Datasource auto-provisioned as `FitbitDB` → `db:5432`
- Both containers use `restart: unless-stopped`
- Postgres data persisted in `.db_data/` (gitignored, ~5-6 GB)

### `auto_migrate.js` Schema Inference Logic

1. Sanitize column names: lowercase, replace non-alphanumeric with `_`, trim edges
2. Deduplicate headers: if collision, append `_1`, `_2`, etc.
3. Type inference per column: scan all rows — if all non-null values parse as numbers → `NUMERIC`; else if all parse as dates → `TIMESTAMPTZ`; else → `TEXT`
4. Filename → table name: strip date suffixes (`- 2020-09-01`, `- 2020-11`, `- 2020`), then sanitize
5. Adds `_raw_id SERIAL PRIMARY KEY` to every table
6. Consolidates multiple monthly CSVs into one table (e.g. 12 HR CSVs → 1 `heart_rate` table)
7. `IGNORE_DIRS`: `node_modules`, `.agent`, `temp_ralph`, `tasks`, `.git`, `Heart Rate`, `Sleep`, `.db_data`
   - `Heart Rate` and `Sleep` are excluded because they contain per-second/per-stage CSVs that would create enormous tables; the API sync (`sync.js`) handles these metrics instead
