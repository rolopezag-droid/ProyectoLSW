## ADDED Requirements
### Requirement: Shared quota protection
The application SHALL stop new FMP network requests for a credential after HTTP 429 until Retry-After or the local cooldown expires, without blocking another credential.
#### Scenario: Multiple resources and symbols
- WHEN the first request receives HTTP 429
- THEN queued resources and subsequent symbols SHALL NOT contact FMP during the cooldown.
### Requirement: Partial cache recovery
Successful resources SHALL be cached independently, and failed resources SHALL become eligible after the cooldown without retaining a partial row for six hours.
#### Scenario: Quota becomes available
- WHEN the cooldown expires and FMP responds successfully
- THEN missing resources SHALL recover while prior successful resources are reused.
### Requirement: Honest cached results
Previously obtained stale data SHALL retain its timestamp and an explicit warning, and absent data SHALL remain unavailable.
#### Scenario: Cached success followed by provider failure
- WHEN refreshed data is rejected
- THEN valid cached data MAY be shown with a stale indicator rather than presented as a fresh quote.
