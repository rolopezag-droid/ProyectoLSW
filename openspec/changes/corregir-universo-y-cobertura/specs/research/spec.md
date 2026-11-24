## ADDED Requirements
### Requirement: Honest full-universe coverage
The application SHALL obtain at least 400 distinct constituents with provenance, attempt every constituent, expose failures and empty chains, and never label partial coverage as a complete ranking.
#### Scenario: Paid provider rejects access
- WHEN FMP responds HTTP 402
- THEN a validated public constituent source SHALL be used and fundamental restrictions SHALL remain explicit.
### Requirement: Inputs and filters
The application SHALL accept arbitrary valid tickers and deduplicated lists separated by commas, whitespace or semicolons, and SHALL invalidate reduced full-index results when filters change.
#### Scenario: Multiple companies
- WHEN the user enters DELL; MSFT AAPL
- THEN all three symbols SHALL be compared independently without truncation.
### Requirement: Partial fundamentals
The application SHALL retain successful endpoint responses, preserve missing values as null and report source restrictions without fabricating scores.
#### Scenario: Restricted ratios with an available profile
- WHEN ratios and statements are rejected but the company profile is available
- THEN the actual capitalization SHALL be shown with a restriction notice and SHALL NOT create a fundamental score with insufficient coverage.
