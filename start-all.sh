#!/bin/bash
# Start Command Centre + Cloudflare tunnel + Telegram webhook

set -e

cd "$(dirname "$0")"

echo "🚀 Starting Command Centre..."

# Start backend server
echo "📡 Starting backend server..."
node server/index.js > logs/server.log 2>&1 &
SERVER_PID=$!
echo "Backend PID: $SERVER_PID"

# Wait for server to be ready
echo "⏳ Waiting for server..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:8787/api/health > /dev/null 2>&1; then
    echo "✅ Server ready"
    break
  fi
  sleep 1
done

# Start tunnel and register webhook
./start-tunnel.sh

echo ""
echo "✅ ALL SYSTEMS OPERATIONAL"
echo "   Backend: http://127.0.0.1:8787"
echo "   Frontend: http://127.0.0.1:4173 (run 'npm run preview' separately)"
echo ""
echo "To stop:"
echo "  pkill -f 'node server/index.js'"
echo "  pkill -f 'cloudflared tunnel'"
