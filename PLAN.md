# JosQoS — build plan

Field-measurement app for the project *Quality of Service Analysis of 4G and 5G Networks in Urban Nigeria: A Study of Jos Metropolis*. One Expo app that collects QoS measurements, stores them on the phone, and analyses them (Chapter 3 pipeline: 3.8–3.19).

## Assumptions (change any of these and tell me)

- **Expo SDK 57** (current Expo Go target). Develop on iPhone in Expo Go; no custom build in Phase 1.
- One collector, one phone, data stored on-device (SQLite). No backend, no accounts.
- Speed/latency are measured against Cloudflare's public speed-test endpoints (`speed.cloudflare.com`). **Checked from this machine (Nigerian IP): served from Amsterdam**, so latency includes the path to Europe. The server is one constant (`src/constants.ts`) so it can be swapped; state this as a limitation in the write-up.
- Latency, jitter and packet loss are **application-level (HTTP) measurements**, not ICMP.
- Signal strength (dBm) is typed in by the researcher from Network Cell Info (Chapter 3.8.3) until Phase 2.
- Locations are a constant list of four (1.8 / 3.4). Chapter 3.21 says six; reconcile the document.

## Scope

| Tab | Does |
|---|---|
| Measure | Pick location, technology (4G/5G), operator (dropdown: MTN, Airtel, Glo, 9mobile; required), signal dBm, runs (1–5) → runs the test, saves each run. **Simulation mode** switch: runs the same flow with no network and made-up numbers, saved as `demo` |
| Data | Lists every measurement, delete one, export CSV, load/clear labelled demo data |
| Analysis | Mean/SD/min/max per technology, 4G vs 5G bars by location or time of day, paired t-test + Wilcoxon, signal-vs-QoS correlation |

Not in scope: maps, accounts, sync, charts library, dark-mode polish, iOS signal strength (iOS does not expose it).

## Data model

One row per run: `id, session_id, created_at, location, period, technology, detected_technology, operator, signal_dbm, download_mbps, upload_mbps, latency_ms, jitter_ms, packet_loss_pct, latitude, longitude, source ('field' | 'demo')`.

## Measurement method (per run)

- **Latency / jitter / loss:** 20 zero-byte requests, first discarded (connection warm-up), 3 s timeout. Latency = mean RTT; jitter = mean absolute difference of consecutive RTTs; loss = `timed-out / sent × 100` (the 3.15 formula).
- **Download:** 1 MB → 10 MB → 50 MB, escalating only while a transfer finishes in under 2 s; result is the last completed transfer (Mbps = bits / seconds / 1e6).
- **Upload:** same escalation with 1 MB → 5 MB → 25 MB.
- **Wi-Fi guard:** a run is refused unless the phone reports a cellular connection (`expo-network`), so a Wi-Fi test can never be saved as 4G/5G.
- Shows data used per run (up to ~60 MB down + ~30 MB up per run on a fast 5G link).

## Statistics (implemented from scratch, verified against SciPy)

- Descriptives: mean, sample SD (n−1), min, max.
- **Pairing rule:** one pair = same date + location + period; each side is the mean of that technology's runs. Paired t-test (two-sided) plus Wilcoxon signed-rank, mirroring SciPy 1.18 `method='auto'`: zero differences dropped; exact p-value when there are no ties/zeros (up to 50 pairs) or at most 13 pairs; otherwise normal approximation with tie correction and no continuity correction. α = 0.05.
- Correlation of signal vs each metric, **within each technology**: Pearson r and Spearman ρ with two-sided p.

## Milestones (each has a check)

1. **Scaffold** — SDK 57, demo content removed, three tabs. ✅ `tsc --noEmit` exit 0; `expo export -p ios` bundles; `expo install --check` clean.
2. **Stats module** — `src/utils/stats.ts`. ✅ 22 tests match SciPy 1.18 to 1e-9, covering every Wilcoxon branch (exact, permutation, normal approximation).
3. **Measurement engine + DB** — `src/measure/`, `src/db/`. ✅ maths unit-tested; `runTest` run against the real Cloudflare endpoints from Node (latency, jitter, loss, download, upload all returned sensible values). ⏳ not yet run on a phone.
4. **Measure + Data tabs** — ✅ written, typecheck and bundle clean. ⏳ needs your iPhone.
5. **Analysis tab** — ✅ written; the logic is tested (analysis, CSV and demo data: 7 tests). ⏳ needs your iPhone.
6. **Hand-off** — `npx expo start`, scan the QR code in Expo Go.

Total: 37 automated tests (`npm test`), `npm run typecheck`.

**Simulation mode** exists so the whole flow (Measure → Data → Export → Analysis) can be tried on an iPhone over Wi-Fi. Simulated runs are stored with `source = 'demo'`, shown as DEMO in the list, flagged on the Analysis tab, and removable in one tap.

## Phase 2: Android module (written, not yet compiled or run on a phone)

`modules/josqos-radio/` is a local Expo module (Kotlin). `src/measure/radio.ts` uses it on an Android build and falls back to `expo-cellular` everywhere else, so Expo Go on iOS is unchanged.

- **Reads:** real network type (LTE / NR / 3G / 2G), 5G NSA, RSRP and SINR for LTE and NR, and the operator of the **data SIM** (not the default voice SIM, which matters on dual-SIM phones).
- **Permissions:** none on Android 12+. Android 11 and below ask for `READ_PHONE_STATE`, and cannot tell NSA 5G from 4G, so they report "not reliable" and never block a run.
- **NSA rule:** a 5G icon alone is not trusted; NSA is only reported when the phone also returns NR signal values.
- **In the app:** signal is read from the phone at the start of every run (the typed field is hidden). A run is refused when the phone's real technology contradicts the selection (a 4G run can never be saved as 5G).
- **API names checked against** Android's `TelephonyManager` / `TelephonyDisplayInfo` / `CellSignalStrength*` source and Expo's Kotlin module source. **Not compiled locally**: this Mac has no Android SDK, so the first compile is the EAS build.
- **Build:** `eas init`, then `eas build -p android --profile preview` (produces an `.apk`). App ID `com.josqos.app`.
- **Checks on a real phone:** the Network card's details line shows the raw readings; switch the phone between 4G-only and 5G-auto and confirm the detected technology changes; try a 3G-only setting to see the refusal.

## Known risks

- Cloudflare's endpoints are public but not a contract for this use; volume here is tiny.
- iOS reports the carrier name unreliably; the operator field is editable.
- Data lives on one phone — export a CSV after every session.
