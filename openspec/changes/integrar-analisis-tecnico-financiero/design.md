# Design

## Context

See `proposal.md` and the capability specs. Today the GUI's `research-analysis.js` owns trend indicators, historical return frequencies, and spread ranking; `research-ui.js` fetches Alpaca bars, quotes, options, and news and persists the result snapshot. Quant already proxies Alpaca and prices options. No main OpenSpec capabilities exist yet.

## Goals / Non-Goals

**Goals:**
- Keep the current browser-based research flow and its snapshot contract additive.
- Make selected evidence and its source/status visible and persistable.
- Query fundamental data through FMP from the GUI server; keep the FMP API key in server environment configuration.

**Non-Goals:**
- Sending broker orders, changing database schemas, using Finviz CSV/scraping, or claiming calibrated forecasts.
- Adding an opaque AI-generated investment recommendation.

## Decisions

1. **Analysis core and support/resistance.** Keep pure market calculations in the existing research analysis module, which already receives Alpaca daily bars. Detect confirmed swing highs/lows, cluster nearby prices using ATR-relative tolerance, count tests, and mark breakouts only after a close clears the zone by a buffer. This avoids look-ahead bias and an external technical-analysis dependency. The alternative was adopting a third-party indicator package; it provides common indicators but not the required zone-clustering contract.

2. **Finite module selection and explanation.** Place independent checkboxes in the existing research panel for technical, Black-Scholes probability, FMP financial metrics, selected-symbol movers, and news. The deterministic explanation will be assembled from structured module results, with selected/unselected state, source, capture time, unavailable reasons, and method labels. Existing historical-frequency estimate remains separate from the risk-neutral Black-Scholes estimate.

3. **Fundamental data provider.** Use FMP's documented stable API from the GUI server. Store `FMP_API_KEY` only in the server environment, validate the requested symbols, cache successful responses for six hours, and report per-symbol unavailable/error states without exposing the key. Query annual key metrics, ratios, and income statements to present valuation, profitability, leverage, and year-over-year growth. The free Basic plan has request, history, and symbol coverage limits; do not promise universal coverage. Its stock screener is not included, so daily gainers/losers are computed only among the user's selected symbols from Alpaca bars.

4. **Structure comparison.** Current structure: calculations and orchestration are coupled in GUI scripts; market prices and options come from Alpaca. Retain the GUI research workflow, add reusable pure calculations for support/resistance and probability, and fetch fundamentals server-side from FMP. A broader domain-service reorganization is not needed for this bounded feature.

5. **Financial evidence and ranking.** Display available valuation, growth, profitability, and leverage fields from FMP. Compute an auditable 0–100 heuristic across eight indicators, renormalizing available weights and requiring at least 50% coverage. Convert it to a bounded 0.80–1.20 multiplier on the candidate ranking score. Keep the empirical and Black-Scholes probabilities untouched and clearly separate; this heuristic is not a probability or calibrated forecast. Missing fields remain missing.

## Risks / Trade-offs

- [FMP free plan may restrict endpoints, symbols, and daily usage] → Cache results, show provider errors and unavailable metrics, and avoid guessing missing values.
- [Pivot confirmation is delayed by right-side bars] → Show confirmation time and never backdate a live signal as if it were known earlier.
- [Historical and model probabilities can be mistaken for certainty] → Keep methods separate, show inputs/sample size, and preserve explicit limitations.
- [FMP data may be stale or absent for a symbol] → Report capture time and report date per symbol, and do not infer absent data.

## Migration Plan

No database migration is required. Existing saved snapshots remain readable; new snapshots add optional module selections and result sections. If an older snapshot lacks them, the existing journal list remains compatible. Rollback consists of reverting the additive GUI and analysis-module changes.
