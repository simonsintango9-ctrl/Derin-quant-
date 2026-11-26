# Deriv Quant AI – Live Digit Analysis & Signal Intelligence Terminal

A browser-based quantitative research and statistical analysis terminal for Deriv synthetic volatility indices using the official Deriv public WebSocket API (`wss://ws.derivws.com/websockets/v3`).

> **Research Disclaimer:** This application is strictly for statistical market analysis and research. It does not execute trades, does not connect to trading accounts, and does not guarantee future outcomes.

## Architecture

- `src/engines/connectionEngine.ts` — Deriv WebSocket client with `active_symbols` validation, `ticks_history` + live `ticks` subscription, heartbeat latency monitoring, and exponential-backoff reconnection.
- `src/engines/digitExtractionEngine.ts` — Precision last-digit extraction using exact `pip_size` decimal scaling (preserving trailing zeros such as `5432.50 -> 0`).
- `src/engines/tickDataEngine.ts` — Chronological rolling tick buffer with duplicate epoch protection.
- `src/engines/statisticalEngine.ts` — Multi-window digit frequency, hot/cold detection, overdue tracking, momentum deltas, repeating sequence patterns, and Shannon entropy.
- `src/engines/markovEngine.ts` — 10x10 discrete Markov transition matrix with configurable Dirichlet/Laplace smoothing.
- `src/engines/probabilityEngine.ts` — Wilson 95% confidence intervals, Chi-square goodness-of-fit survival function (`df=9`), rolling frequency trajectories, anomaly detection, and 70/30 out-of-sample validation.
- `src/engines/signalEngine.ts` — Matches & Differs statistical evaluation with evidence-based confidence tiers.
- `src/engines/scannerEngine.ts` — Cross-market statistical dispersion screening across all 10 supported Volatility (1s) and Standard Volatility indices.
- `src/engines/performanceEngine.ts` — Strict out-of-sample next-tick outcome grading and multi-dimensional accuracy analytics.
- `src/engines/storageEngine.ts` — LocalStorage for user preferences and IndexedDB for tick buffers and historical signal ledgers.
- `src/engines/diagnosticTests.ts` — Built-in algorithmic verification suite accessible from Settings.

## Running Locally

```bash
npm install
npm run dev
```

## Production Build & Deployment

```bash
npm run build
```

The static bundle in `dist/` can be deployed directly to Netlify, Vercel, or GitHub Pages.
