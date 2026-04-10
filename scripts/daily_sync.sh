#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# daily_sync.sh — Wrapper for node sync.js with logging
#
# Designed to be run via cron. Logs output to logs/sync.log
# with timestamps and rotation (keeps last 30 days of logs).
#
# Usage:
#   Manual:   bash scripts/daily_sync.sh
#   Cron:     0 7 * * * /path/to/dl-fitbit-data/scripts/daily_sync.sh
#
# To install the cron job automatically, run:
#   bash scripts/install_cron.sh
# ─────────────────────────────────────────────────────────────

# Always resolve paths relative to repo root, regardless of where cron runs from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$REPO_DIR/logs/sync.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# ── Ensure logs directory exists ─────────────────────────────
mkdir -p "$REPO_DIR/logs"

# ── Log start ────────────────────────────────────────────────
echo "" >> "$LOG_FILE"
echo "═══════════════════════════════════════════" >> "$LOG_FILE"
echo "[$DATE] 🔄 Starting daily Fitbit sync..." >> "$LOG_FILE"
echo "═══════════════════════════════════════════" >> "$LOG_FILE"

# ── Find node — cron has a minimal PATH ──────────────────────
NODE_BIN=$(command -v node 2>/dev/null || echo "/usr/local/bin/node")
if [ ! -x "$NODE_BIN" ]; then
    # Try common locations
    for p in /usr/bin/node /usr/local/bin/node ~/.nvm/versions/node/*/bin/node; do
        if [ -x "$p" ]; then NODE_BIN="$p"; break; fi
    done
fi

if [ ! -x "$NODE_BIN" ]; then
    echo "[$DATE] ❌ node not found. Install Node.js or update PATH." >> "$LOG_FILE"
    exit 1
fi

# ── Run sync ─────────────────────────────────────────────────
cd "$REPO_DIR" || exit 1
"$NODE_BIN" sync.js >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

# ── Log result ───────────────────────────────────────────────
if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Sync finished successfully." >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Sync failed with exit code $EXIT_CODE." >> "$LOG_FILE"
fi

# ── Rotate log: keep only last 500 lines ─────────────────────
tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"

exit $EXIT_CODE
