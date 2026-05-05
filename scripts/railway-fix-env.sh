#!/usr/bin/env bash
# railway-fix-env.sh
# One-shot: log in to Railway, link the project, push the Google Ads / Meta /
# Telegram / Shopify env vars from local .env, and trigger a fresh deploy.
#
# Run from anywhere:
#   bash /Users/wogbot/.openclaw/workspace/command-centre-app/scripts/railway-fix-env.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI not found. Install: npm i -g @railway/cli"
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env not found in $(pwd) — aborting"
  exit 1
fi

# Login if needed
if ! railway whoami >/dev/null 2>&1; then
  echo "Not logged in to Railway. Opening browser login…"
  railway login
fi

# Link the project (idempotent)
if [ ! -f .railway/project.json ] && [ ! -d .railway ]; then
  echo "Linking Railway project…"
  echo "Pick: command-centre"
  railway link
fi

# Vars we care about — only push if present in local .env
declare -a VARS=(
  GOOGLE_ADS_DEVELOPER_TOKEN
  GOOGLE_ADS_CLIENT_ID
  GOOGLE_ADS_CLIENT_SECRET
  GOOGLE_ADS_REFRESH_TOKEN
  GOOGLE_ADS_LOGIN_CUSTOMER_ID
  GOOGLE_ADS_CUSTOMER_ID
  META_ACCESS_TOKEN
  META_AD_ACCOUNT_ID
  TELEGRAM_JOSH_CHAT_ID
  SHOPIFY_ADMIN_TOKEN
)

echo
echo "Pushing env vars from local .env to Railway…"
for KEY in "${VARS[@]}"; do
  VAL=$(grep -E "^${KEY}=" .env | head -1 | cut -d= -f2- || true)
  if [ -z "$VAL" ]; then
    echo "  ⚠  $KEY missing from local .env — skipping"
    continue
  fi
  echo "  → $KEY"
  railway variables --set "${KEY}=${VAL}" >/dev/null
done

echo
echo "Triggering redeploy…"
railway redeploy -y >/dev/null 2>&1 || railway up --detach >/dev/null 2>&1 || true

echo
echo "✅ Done. Watch deploy status:"
echo "   railway logs --deployment"
echo
echo "Then hard-refresh https://command-centre.up.railway.app/ (Cmd+Shift+R)"
