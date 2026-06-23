# GMB Poster launchd Agent

This directory contains the launchd plist for the Google My Business (GMB) auto-poster.

## One-time install

```bash
cp configs/com.gri.gmbposter.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.gri.gmbposter.plist
# to disable: launchctl unload ~/Library/LaunchAgents/com.gri.gmbposter.plist
```

## Notes

- Runs daily at 9:00 AM local time (`StartCalendarInterval`).
- `RunAtLoad` is set to `false`, so loading the agent will NOT trigger an immediate run — it only fires on the scheduled time.
- Node binary path: `/opt/homebrew/bin/node` (resolved via `which node`).
- Stdout log: `logs/gmb-poster.log`
- Stderr log: `logs/gmb-poster.error.log`

## Verifying it's loaded

```bash
launchctl list | grep com.gri.gmbposter
```
