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

```bash
# Edit your crontab
crontab -e

# Add this line — runs every morning at 7am
0 7 * * * cd /path/to/dl-fitbit-data && node sync.js >> logs/sync.log 2>&1
```

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

# View logs
docker logs fitbit-grafana
docker logs fitbit-postgres

# Re-run migration (safe — rebuilds tables from CSV)
node auto_migrate.js

# Sync latest data from Fitbit API
node sync.js
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
