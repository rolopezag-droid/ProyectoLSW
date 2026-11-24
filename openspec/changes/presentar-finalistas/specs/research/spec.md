## ADDED Requirements
### Requirement: Finalist presentation
The application SHALL initially show at most ten ranked companies with one strategy each, comparative reasons and matching selected-core panels.
#### Scenario: Complete universe analysis
- WHEN more than ten companies have eligible scored strategies
- THEN the ten highest ranked companies SHALL be shown and other companies SHALL NOT appear in the initial core panels.
### Requirement: Explicit full results
The application SHALL preserve the full analysis and original candidate indices when changing the visible scope.
#### Scenario: User requests all results
- WHEN the user selects all results and returns to the Top 10
- THEN the visible companies and panels SHALL change without another provider request or altered scores.
