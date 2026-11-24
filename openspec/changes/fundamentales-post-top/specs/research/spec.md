## ADDED Requirements
### Requirement: Post-selection fundamentals
The S&P 500 workflow SHALL select at most ten eligible finalists before requesting their fundamentals, and SHALL NOT use those post-selection metrics to rank the full universe.
#### Scenario: Full index with fundamental selected
- WHEN the index analysis completes
- THEN only the selected finalists SHALL be requested from FMP and expanding results SHALL NOT trigger further requests.
#### Scenario: Fundamental alone
- WHEN no other scoring core is selected
- THEN the workflow SHALL request another scoring core before any provider query.
### Requirement: Section sequence
The comparison section SHALL appear after news in its numbered position.
#### Scenario: Top result rendering
- WHEN the Top is rendered
- THEN section 05 SHALL follow section 04 rather than precede section 01.
