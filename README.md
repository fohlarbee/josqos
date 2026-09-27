# JosQoS

A field-measurement app for the final-year project *Quality of Service Analysis of 4G and 5G Networks in Urban Nigeria: A Study of Jos Metropolis, Plateau State*.

One Expo app, three tabs:

- **Measure** — pick a location, technology (4G/5G) and operator, then run 1–5 tests. Measures download, upload, latency, jitter and packet loss. Refuses to run on Wi-Fi.
- **Data** — every saved run, CSV export, and a "load demo data" button for trying the app without spending mobile data.
- **Analysis** — mean/SD per technology, 4G vs 5G charts, a paired t-test and Wilcoxon signed-rank test, and signal-vs-QoS correlation. The statistics are implemented from scratch and verified against SciPy (see `PLAN.md`).

Everything is stored on the phone (SQLite); there is no backend or account.

For scope, method, data model and build status, see [`PLAN.md`](./PLAN.md). This file only covers running and developing the app.

## Requirements

- Node.js and npm
- An iPhone with the [Expo Go](https://apps.apple.com/app/expo-go/id982107779) app, or an Android phone

## Running it

```bash
npm install
npm start
```

Scan the QR code with the iPhone Camera app (or the Expo Go app on Android) to open it in Expo Go.

Two things about Measure specifically:

- It needs mobile data with Wi-Fi off to run a real test. Over Wi-Fi (including the Expo Go connection to your dev machine), it will refuse to start — turn on **Simulation mode** on the Measure tab instead, which runs the same flow offline with made-up numbers saved as `demo` rows.
- On iOS, run it on your own phone; there is no way to see real network type or signal strength in Expo Go.

## Android: native module and builds

Real network type (LTE/NR/5G-NSA) and signal strength (RSRP/SINR) come from a small native module (`modules/josqos-radio/`, Kotlin) that only exists in a **built** Android app — it is not available in Expo Go. On Expo Go and iOS the app falls back to `expo-cellular`, with signal typed in by hand.

To build and install an Android APK:

```bash
eas init                                  # once, links the project to an Expo account
eas build -p android --profile preview    # produces an installable .apk
```

Once that build is installed, JavaScript-only changes can ship without a new build:

```bash
eas update --channel preview --message "what changed"
```

A change to `modules/josqos-radio/`, a new native package, or an `app.json` plugin needs a new build (and a bump of `version` in `app.json` first). See "Shipping fixes to an installed Android app" in `PLAN.md` for the full rule.

## Scripts

| Command | Does |
|---|---|
| `npm start` | Start the dev server (scan the QR code in Expo Go) |
| `npm test` | Run the unit tests (statistics, measurement maths, analysis logic) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |

## Project structure

```
src/
  app/          Expo Router routes (one file per tab)
  screens/      The tab bodies: measure.tsx, data.tsx, analysis.tsx
  measure/      Measurement engine, radio detection, simulation
  utils/        Statistics, analysis, CSV export, demo data — all unit-tested
  components/   Shared UI (button, card, chip, dropdown, bar chart, ...)
  db/           SQLite storage
  constants/    App constants (locations, operators, test server) and theme
modules/
  josqos-radio/ Local Expo module (Kotlin): Android-only network/signal detection
```

Statistics fixtures in `src/utils/stats.fixtures.json` are generated from SciPy by `scripts/make-stats-fixtures.py` — see that file's docstring to regenerate them.
