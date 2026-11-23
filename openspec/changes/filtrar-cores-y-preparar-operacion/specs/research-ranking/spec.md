## ADDED Requirements
### Requirement: Selected cores determine the ranking
The system SHALL display and rank only information from selected cores, disclosing missing data and excluding unrankable candidates from the company top.
#### Scenario: Black-Scholes only
- **WHEN** only Black-Scholes is selected
- **THEN** technical columns and panels are hidden and technical trend does not affect the score
#### Scenario: Missing selected core
- **WHEN** fundamental is selected but unavailable
- **THEN** the score is unavailable and the company receives no ranked position
#### Scenario: News only
- **WHEN** news is the only selected module
- **THEN** news is displayed but no company top is invented

### Requirement: Two comparison journeys
The system SHALL filter the candidate universe before grouping the best strategy per company or showing operations for a selected company.
#### Scenario: Filter before grouping
- **WHEN** the best pair fails a risk filter
- **THEN** the top uses the next eligible pair for that company

### Requirement: Prepare a validated suggestion
The system SHALL transfer a verified suggestion to the operation request without sending orders or persisting records.
#### Scenario: Preparing each vertical spread
- **WHEN** the user prepares a verified Bull Call, Bull Put, Bear Call or Bear Put
- **THEN** the operation view receives its company, expiration, strikes, premiums, multiplier and reference price

### Requirement: Available expirations
The system SHALL offer paginated expiration dates from active provider contracts and reject incomplete catalogs.
#### Scenario: Repeated page token
- **WHEN** Alpaca repeats a page token
- **THEN** the system reports an error instead of displaying a partial catalog

### Requirement: No resistance display
The system SHALL omit resistance overlays and resistance data from comparison views.
#### Scenario: Technical selected
- **WHEN** technical is selected
- **THEN** trend and indicators may appear but resistance is not displayed
