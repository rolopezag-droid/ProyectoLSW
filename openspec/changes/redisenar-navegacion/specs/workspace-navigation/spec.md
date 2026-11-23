# Workspace navigation
## ADDED Requirements
### Requirement: Independent task views
The interface SHALL expose Inicio, Mercado, Comparar estrategias, Nueva operación and Historial with one active view at a time. Calculator and connection administration SHALL NOT be exposed as user views.
#### Scenario: Switch context
- WHEN a user opens Mercado and then Nueva operación
- THEN the market view SHALL be hidden, the operation view SHALL be visible and entered values SHALL remain unchanged.
### Requirement: Understandable entry point
The interface SHALL provide an initial guide to consult a company, compare strategies and evaluate an operation without submitting broker orders.
#### Scenario: First visit
- WHEN a user opens the app without a route
- THEN Inicio SHALL explain the available tasks and link to their views.
### Requirement: Traceable navigation
The interface SHALL synchronize view, URL and active navigation and SHALL keep original financial handlers connected.
#### Scenario: Direct link
- WHEN the user opens #mercado or uses browser history
- THEN the corresponding view SHALL appear without triggering an order or losing form state.
