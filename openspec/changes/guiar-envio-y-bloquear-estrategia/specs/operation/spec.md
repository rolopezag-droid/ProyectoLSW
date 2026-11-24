## ADDED Requirements
### Requirement: Explicit execution navigation
The operation panel SHALL expose a button that opens the existing Paper execution section without placing orders.
#### Scenario: Open execution section
- WHEN the user activates the navigation button
- THEN the execution section SHALL open and no order request SHALL be made.
### Requirement: Lock prepared strategy
Preparing a candidate SHALL enable only its strategy and disable the other three choices.
#### Scenario: Replace prepared strategy
- WHEN another candidate is prepared
- THEN the lock SHALL follow that candidate while preserving its contracts and premiums.
#### Scenario: Return to manual selection
- WHEN the user explicitly unlocks the selector
- THEN all choices SHALL become available and prior quotes, evaluation and pending preparation SHALL be invalidated.
