# Command Centre Startup Guide

## Quick Start (ASAP)

```bash
cd /Users/wogbot/.openclaw/workspace/command-centre-app
./start-tunnel.sh
```

This will:
1. ✅ Kill old Cloudflare tunnel
2. ✅ Start fresh tunnel with new URL
3. ✅ Update `.env` automatically
4. ✅ Register Telegram webhook
5. ✅ Bot is live and replying

## Full System Start

If backend server is not running:

```bash
./start-all.sh
```

This starts:
- Backend server (port 8787)
- Cloudflare tunnel
- Telegram webhook registration

Frontend (optional):
```bash
npm run preview  # port 4173
```

## Why Does This Break?

Cloudflare quick tunnels generate **random URLs** that expire when the process dies.

**Every time you restart:**
- Cloudflare gives a new URL
- Telegram webhook must be re-registered with the new URL
- `.env` needs updating

## The Scripts Handle This Automatically

- `start-tunnel.sh` — Just fix Telegram (tunnel + webhook)
- `start-all.sh` — Full system restart (backend + tunnel + webhook)

## Manual Check

```bash
# Check webhook status
curl http://127.0.0.1:8787/api/telegram-bot/status

# Check tunnel URL
cat /tmp/cloudflared.log | grep "https://"
```

## Permanent Solution

To avoid this in the future:
1. Get a static domain
2. Use named Cloudflare tunnel (not quick tunnel)
3. OR: Deploy to production server with public IP

For now, just run `./start-tunnel.sh` whenever the bot stops replying.
