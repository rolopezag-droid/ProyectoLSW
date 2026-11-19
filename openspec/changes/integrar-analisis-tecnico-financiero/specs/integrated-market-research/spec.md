# Spec Delta

## Purpose

Permite seleccionar fuentes y métodos de análisis de mercado y entrega una explicación auditable de las señales usadas para comparar estrategias de opciones.

## ADDED Requirements

### Requirement: Select analysis modules
The system SHALL let the user independently select Black-Scholes, technical, FMP fundamental, selected-symbol movers, and news modules before running research.

#### Scenario: Run selected modules
- **WHEN** the user selects one or more modules and starts analysis
- **THEN** the result SHALL identify the selected modules and include available findings from each selected module

#### Scenario: Module is not selected
- **WHEN** the user leaves a module unchecked
- **THEN** the system SHALL exclude that module's findings from the decision summary and SHALL NOT present them as evidence

### Requirement: Explain the analysis evidence
The system SHALL show a deterministic summary of the data sources, signals, filters, and limitations that contributed to the results.

#### Scenario: Analysis completes
- **WHEN** at least one underlying has valid market data
- **THEN** the summary SHALL name the selected methods, show their available findings, and indicate unavailable data without inventing a signal

#### Scenario: Persist analysis evidence
- **WHEN** the user saves an analysis
- **THEN** its selected modules, methods, data-source timestamps, findings, and probability metadata SHALL be included in the saved snapshot

### Requirement: Distinguish probability estimates
The system SHALL present Black-Scholes risk-neutral estimates separately from historical outcome frequencies and SHALL label assumptions and sample information.

#### Scenario: Both estimates are available
- **WHEN** a strategy has sufficient data for both methods
- **THEN** the result SHALL show separate labeled values and SHALL NOT combine them into one calibrated probability

#### Scenario: Estimate has insufficient inputs
- **WHEN** the required volatility, time horizon, or historical sample is missing
- **THEN** the corresponding estimate SHALL be marked unavailable with its reason

### Requirement: Report market winners and losers
The system SHALL rank daily gainers and losers only among the analyzed symbols using Alpaca daily bars and SHALL identify this limited comparison scope.

#### Scenario: Selected symbols have daily changes
- **WHEN** the selected symbols have valid latest and prior daily closes
- **THEN** the system SHALL show their daily gainers and losers with price-change percentages and identify Alpaca as the source

#### Scenario: Selected-symbol comparison is narrow
- **WHEN** one or fewer selected symbols have daily changes
- **THEN** the system SHALL identify the narrow comparison scope and SHALL NOT imply it ranks the whole market

### Requirement: Retrieve fundamentals from FMP
The system SHALL retrieve fundamental data from FMP on the server using an environment-configured API key, SHALL NOT expose the key to the browser, and SHALL report provider capture time, report dates, and unavailable data.

#### Scenario: FMP returns financial data
- **WHEN** the user selects the fundamental module and FMP returns statements or key metrics for a symbol
- **THEN** the system SHALL show available valuation, profitability, leverage, and annual growth fields with their report date

#### Scenario: FMP is not configured or data is unavailable
- **WHEN** the FMP key is missing or the provider has no data for a selected symbol
- **THEN** the system SHALL report the limitation without fabricating values or exposing the key

### Requirement: Score fundamental evidence separately from probability
The system SHALL calculate an explainable 0–100 fundamental heuristic when at least 50% of its weighted inputs are available, and MAY use its bounded multiplier to adjust the strategy ranking score. It SHALL NOT modify or relabel the historical or Black-Scholes probabilities.

#### Scenario: Fundamental coverage is sufficient
- **WHEN** available fundamental metrics cover at least half of the defined score weights
- **THEN** the system SHALL show the score, contributing components, coverage, and bounded ranking factor, and SHALL apply that factor to the strategy ranking score

#### Scenario: Fundamental coverage is insufficient
- **WHEN** available fundamental metrics cover less than half of the score weights
- **THEN** the system SHALL withhold the fundamental score and SHALL leave the ranking score unadjusted
