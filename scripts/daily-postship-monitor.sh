#!/bin/zsh
# Daily post-ship monitor — runs the 24h diag and writes to dated log
# Auto-installed in macOS user crontab at 08:13 AEST

cd /Users/wogbot/.openclaw/workspace/command-centre-app || exit 1

LOG_DIR="data/monitor-logs"
mkdir -p "$LOG_DIR"

DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/daily-$DATE.log"

# Source node from typical install paths
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"

{
  echo "═══════════════════════════════════════════"
  echo "DAILY POST-SHIP MONITOR — $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "═══════════════════════════════════════════"

  # Day counter from May 28 ship date
  SHIP=$(date -j -f "%Y-%m-%d" "2026-05-28" "+%s")
  NOW=$(date +%s)
  DAYS=$(( (NOW - SHIP) / 86400 ))
  echo "Day $DAYS since ship"
  echo ""

  node scripts/last-24h-vs-prior.js 2>&1
} > "$LOG_FILE" 2>&1

# Keep last 30 days only
find "$LOG_DIR" -name "daily-*.log" -mtime +30 -delete 2>/dev/null

# Symlink "latest" for easy access
ln -sf "daily-$DATE.log" "$LOG_DIR/latest.log"
