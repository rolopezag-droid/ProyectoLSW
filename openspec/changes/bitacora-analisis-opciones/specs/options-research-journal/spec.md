# options-research-journal Specification
## Requirements
### Requirement: Comparar spreads verticales
The system SHALL evaluate Bull Call, Bear Call, Bull Put, and Bear Put for a selected underlying using one expiration and valid two-leg quotes.
#### Scenario: Compare all supported strategies
- **WHEN** the user requests analysis for an underlying and expiration with usable option quotes
- **THEN** the system returns each valid spread candidate with strikes, quote timestamp, max profit, max loss, break-even, and risk/reward
#### Scenario: Reject stale or incomplete market data
- **WHEN** quotes are missing, invalid, or outside the configured freshness window
- **THEN** the system marks the candidate unavailable and explains which input is missing

### Requirement: Explain probability estimates
The system SHALL distinguish probability of profit at expiration from directional confidence and SHALL disclose the estimation method, sample period, assumptions, and uncertainty interval.
#### Scenario: Estimate probability of profit
- **WHEN** an analysis has sufficient dated price observations and an expiration horizon
- **THEN** the system reports an empirical probability estimate and a confidence interval based on historical observations, alongside any model-based estimate when available
#### Scenario: Insufficient observations
- **WHEN** the historical sample is too small or required inputs are unavailable
- **THEN** the system withholds the estimate and reports the limitation instead of presenting a fabricated probability

### Requirement: Preserve a research journal
The system SHALL save an immutable analysis snapshot with underlying, evaluated strategies, source timestamps, technical signals, news evidence, filters, estimation assumptions, and the user's decision. Fundamental analysis is out of scope.
#### Scenario: Save analysis
- **WHEN** an authenticated user saves an analysis
- **THEN** the snapshot is associated with that user and can be retrieved without recalculating its historical inputs
#### Scenario: Provider evidence unavailable
- **WHEN** news data cannot be retrieved
- **THEN** the journal records the source status and does not imply that the evidence was reviewed

### Requirement: Rank candidates transparently
The system SHALL rank only candidates that pass user-configured filters and SHALL show the values and reasons behind each pass or rejection.
#### Scenario: Candidate passes filters
- **WHEN** a candidate satisfies configured liquidity, risk, and probability thresholds
- **THEN** it appears in the ranked list with its score components
#### Scenario: Candidate fails filters
- **WHEN** a candidate violates a configured threshold
- **THEN** it is excluded from recommendations and its failed conditions are shown
