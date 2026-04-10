#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# install_cron.sh — Add daily Fitbit sync to your crontab
#
# Usage: bash scripts/install_cron.sh
#
# What it does:
#   - Adds a cron job that runs daily_sync.sh every morning at 7am
#   - Safe to run multiple times — won't add duplicates
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SYNC_SCRIPT="$REPO_DIR/scripts/daily_sync.sh"
CRON_JOB="0 7 * * * $SYNC_SCRIPT"

# Make the sync script executable
chmod +x "$SYNC_SCRIPT"

# Check if already installed
if crontab -l 2>/dev/null | grep -qF "$SYNC_SCRIPT"; then
    echo "✅ Cron job already installed — nothing to do."
    echo ""
    echo "Current crontab:"
    crontab -l | grep "$SYNC_SCRIPT"
    exit 0
fi

# Add to crontab
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron job installed successfully!"
echo ""
echo "   Schedule: Every day at 7:00 AM"
echo "   Script:   $SYNC_SCRIPT"
echo "   Logs:     $REPO_DIR/logs/sync.log"
echo ""
echo "To view logs:"
echo "   tail -f $REPO_DIR/logs/sync.log"
echo ""
echo "To remove the cron job:"
echo "   crontab -l | grep -v '$SYNC_SCRIPT' | crontab -"
