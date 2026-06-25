# Vitals — personal health tracker

An in-depth mobile health app (iOS + Android) that pulls **live Oura Ring data**
and tracks **historic blood tests**, then surfaces plain-language insights across both.

Built with Expo (React Native). Everything stays on the phone — no backend, no
account, no data leaves the device except direct calls to the Oura API.

## What it does

- **Today** — readiness, sleep and activity scores at a glance, last night's body
  vitals (HRV, resting HR, temperature deviation, SpO₂, respiratory rate), today's
  stress load, and the top insights.
- **Sleep** — last night's sleep stages (deep/REM/light/awake), efficiency, latency,
  overnight HRV and heart rate, plus trends for sleep score, hours asleep, HRV and
  efficiency.
- **Body** — HRV, resting heart rate, body-temperature deviation, SpO₂, daily steps,
  resilience, VO₂ max and cardiovascular age, each with trends.
- **Bloods** — enter results from her pathology reports against a built-in reference
  library (Australian units, ~45 common markers). Out-of-range values are flagged and
  every marker is tracked over time with a trend chart.
- **Insights** — combines Oura trends and blood markers (e.g. low ferritin alongside an
  elevated resting heart rate, low vitamin D against sleep quality) into clear notes to
  discuss with her GP.

> Not a medical device. Reference ranges are general adult guides and vary by lab,
> age and cycle phase — always defer to the ranges on her actual report.

## Getting her Oura token

1. Sign in at <https://cloud.ouraring.com> with her Oura account.
2. Open **Personal Access Tokens** → create a token.
3. Paste it into the app's onboarding screen. It's stored encrypted on the device
   (secure keystore) and only used to call Oura directly.

Some metrics (resilience, cardiovascular age, VO₂ max, detailed stress) require an
active Oura membership; the app degrades gracefully if any are unavailable.

## Run it

You need Node 18+ and the **Expo Go** app on her phone (App Store / Play Store).

```bash
cd health-tracker
npm install
npx expo install --fix   # aligns native module versions to the installed Expo SDK
npx expo start           # scan the QR code with Expo Go (or press i / a for a simulator)
```

That's it — the app loads on her phone over the same Wi-Fi. No build or app-store
submission needed to use it day to day.

### Turning it into a standalone installable app (optional)

When you want a real installable build (TestFlight / APK) rather than Expo Go:

```bash
npm install -g eas-cli
eas build -p ios      # or -p android
```

## Project layout

```
health-tracker/
  App.js                     entry — onboarding gate + navigation
  src/
    api/oura.js              Oura Ring API v2 client
    storage/                 secure token + local blood-results store
    data/bloodMarkers.js     reference-range library (AU units)
    hooks/                   Oura data loader + shared provider
    insights/engine.js       Oura × bloods correlation engine
    components/              ScoreRing, TrendChart, shared UI
    screens/                 Today, Sleep, Body, Bloods, BloodDetail, BloodEntry, Insights, Settings, Onboarding
    navigation/              tab + stack navigator
    utils/                   dates, stats, Oura selectors
```

## Notes for future work

- Blood results are entered manually today; a natural next step is PDF/photo import of
  pathology reports with OCR to auto-fill markers.
- The insights engine is deterministic/rule-based and easy to extend in
  `src/insights/engine.js`. An optional AI layer could be added later.
- Cycle-aware ranges for hormones could use a logged period start date.
