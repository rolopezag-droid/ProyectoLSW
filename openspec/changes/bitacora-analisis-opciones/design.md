# Design
## Current structure
GUI (`services/gui-service`) currently combines strategy selection, quote retrieval, charting, evaluation, and a browser-local history. Quant Service provides Alpaca quotes, option chains, candles, and vertical payoff calculations. Spread Service persists user-owned spreads and evaluations in the existing Supabase tables. No financial-statement or news adapter was found in the current services.

## Proposed and applied structure
Keep provider access in the existing Quant adapters/controllers. Pure indicators and probability calculations live in the standalone `research-analysis.js` module used by GUI; comparison and rendering orchestration live in `research-ui.js`. Alpaca news is requested server-side through Quant to keep credentials out of the browser. Append-only journal persistence lives in Spread Service. Fundamental analysis is excluded from the UI and journal snapshot.

## Alternatives and decision
Persisting the analysis only in `localStorage` is simple but cannot provide a durable, user-owned journal across devices. Adding new columns to current spread tables would mix immutable research snapshots with editable trade records and is excluded by project policy. The design therefore uses a dedicated journal persistence contract; implementation must use an already-approved storage mechanism or separately authorize a schema change before durable server-side journal writes.

## Boundaries and migration
Existing market-data contracts are reused. New journal endpoints are authenticated and owner-scoped. A dedicated SQL migration is supplied, but is not automatically applied to Supabase. Durable cloud journaling requires the user to apply that migration.

## Probability and uncertainty
Probability of profit at expiration is estimated from overlapping historical close-to-close returns over the trading-day horizon derived from expiration, evaluated against each spread's break-even. Report sample size and an approximate Wilson interval; disclose that overlapping observations can understate uncertainty and that historical outcomes are not a calibrated forecast. The score is an uncalibrated heuristic of probability, reward/risk, relative bid/ask width, and a small trend alignment factor. Do not label it as certainty or recommendation.
