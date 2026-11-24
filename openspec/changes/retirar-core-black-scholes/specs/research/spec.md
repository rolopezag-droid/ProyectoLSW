## ADDED Requirements
### Requirement: Remove standalone Black-Scholes ranking
The comparator SHALL NOT expose a standalone Black-Scholes selector, probability column or score contribution, including when a legacy flag is provided.
#### Scenario: Analyze selected modules
- WHEN a user analyzes companies
- THEN only the remaining selected ranking cores SHALL contribute and no Black-Scholes probability SHALL be computed for that comparison.
### Requirement: Preserve quantitative calculations
The Quant pricing, Greeks and implied-volatility functions SHALL remain available.
#### Scenario: Quant regression
- WHEN pricing validation and Greeks regression tests execute
- THEN they SHALL retain their existing results after removal of the comparator module.
