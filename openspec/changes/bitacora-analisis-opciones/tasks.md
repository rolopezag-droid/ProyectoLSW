## 1. Requirements and discovery
- [x] 1.1 Confirm existing market-data contracts, candle constraints, quote freshness, and storage options.
- [x] 1.2 Specify technical indicators, probability methodology, candidate ranking filters, and evidence fields.
## 2. Implementation
- [x] 2.1 Add pure technical-indicator and historical probability calculations with uncertainty reporting.
- [x] 2.2 Compare the four vertical strategies using the existing current option quote and candle contracts.
- [x] 2.3 Add GUI screens for technical/financial/news evidence, candidate ranking, strike comparison, and limitations.
- [x] 2.4 Add an immutable user-owned journal persistence contract and proposed SQL migration without applying it to remote Supabase.
- [x] 2.5 Integrate Alpaca's ticker-filtered news endpoint and include returned articles in the UI and saved snapshot.
- [x] 2.6 Remove the fundamental-analysis placeholder from the UI and snapshot at the user's direction.
## 3. Verification and evidence
- [ ] 3.1 Add unit and API tests for indicators, probability calibration bounds, unavailable inputs, and all four spreads.
- [ ] 3.2 Add UI tests for ranking explanations, evidence timestamps, and journal snapshots.
- [x] 3.3 Record author, AI assistance, changed files, actual test results, and provider limitations.
