# Cloud deployment
## ADDED Requirements
### Requirement: Service routing
The deployment SHALL route public API requests to the existing service through private bindings and SHALL preserve local startup.
#### Scenario: Remote dashboard
- WHEN a user loads the deployed dashboard and requests option calculations
- THEN the request SHALL reach Quant without referencing the user's localhost.
### Requirement: Honest persistence and controlled operations
The deployment SHALL NOT expose anonymous broker execution, publish local secrets, or report temporary files as durable storage.
#### Scenario: Missing remote MongoDB
- WHEN Catalog has no remote database configuration
- THEN it SHALL return an explicit unavailable response instead of waiting indefinitely or fabricating records.
#### Scenario: Paper execution is not enabled
- WHEN an external caller attempts to submit a broker order
- THEN the deployed endpoint SHALL reject the request before invoking Alpaca.
