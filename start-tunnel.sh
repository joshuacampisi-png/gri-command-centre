#!/bin/bash
# Automated Cloudflare tunnel + Telegram webhook registration

set -e

# Kill any existing cloudflared processes
pkill -f "cloudflared tunnel" || true
sleep 2

# Start cloudflare tunnel in background
echo "🚀 Starting Cloudflare tunnel..."
cloudflared tunnel --url http://127.0.0.1:8787 > /tmp/cloudflared.log 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL (max 15 seconds)
echo "⏳ Waiting for tunnel URL..."
for i in {1..15}; do
  if grep -q "https://.*trycloudflare.com" /tmp/cloudflared.log; then
    break
  fi
  sleep 1
done

# Extract tunnel URL
TUNNEL_URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/cloudflared.log | head -1)

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ Failed to get tunnel URL"
  exit 1
fi

echo "✅ Tunnel URL: $TUNNEL_URL"

# Update .env file
sed -i '' "s|BASE_URL=.*|BASE_URL=$TUNNEL_URL|" .env
sed -i '' "s|TELEGRAM_WEBHOOK_URL=.*|TELEGRAM_WEBHOOK_URL=$TUNNEL_URL/api/telegram-bot/webhook|" .env

echo "📝 Updated .env with new tunnel URL"

# Wait for server to be ready (assuming it's already running or will be started)
echo "⏳ Waiting for server to be ready..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:8787/api/health > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Register webhook with Telegram
echo "🔗 Registering Telegram webhook..."
WEBHOOK_URL="$TUNNEL_URL/api/telegram-bot/webhook"
RESULT=$(curl -s -X POST http://127.0.0.1:8787/api/telegram-bot/set-webhook \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$WEBHOOK_URL\"}")

if echo "$RESULT" | grep -q '"ok":true'; then
  echo "✅ Telegram webhook registered: $WEBHOOK_URL"
  echo "🤖 Bot is now listening!"
  echo ""
  echo "Cloudflare tunnel PID: $TUNNEL_PID"
  echo "Tunnel URL: $TUNNEL_URL"
else
  echo "❌ Failed to register webhook:"
  echo "$RESULT"
  exit 1
fi
