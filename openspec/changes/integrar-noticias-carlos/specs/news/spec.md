## ADDED Requirements
### Requirement: Integrated news filtering
The GUI SHALL consume backend sentiment while retaining scoped Top results and compatibility with news lacking sentiment.
#### Scenario: Matching article beyond initial page
- WHEN the user filters bearish news and a matching article is after the first twenty
- THEN filtering SHALL occur before truncation and SHALL NOT fetch or alter ranking scores.
### Requirement: Negation handling
The heuristic SHALL exclude recognized phrases immediately negated in the title or summary.
#### Scenario: Negated forecast
- WHEN the headline says the company did not raise guidance
- THEN the negated phrase SHALL NOT count as a bullish signal.
