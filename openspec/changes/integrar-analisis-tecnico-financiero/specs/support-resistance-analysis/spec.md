# Spec Delta

## Purpose

Identifica zonas de precio donde la acción histórica sugiere soporte o resistencia, y muestra evidencia y límites para que el usuario pueda revisar esos niveles.

## ADDED Requirements

### Requirement: Detect confirmed price pivots
The system SHALL derive candidate support and resistance levels from historical candle pivots and SHALL use only pivots confirmed by subsequent candles.

#### Scenario: Pivot is confirmed
- **WHEN** a candle high or low has the configured number of later candles needed to confirm a pivot
- **THEN** the system SHALL add it as a candidate resistance or support level, respectively

#### Scenario: Pivot is not yet confirmed
- **WHEN** there are not enough later candles to confirm a candidate pivot
- **THEN** the system SHALL exclude that candidate from reported levels

### Requirement: Group nearby levels into zones
The system SHALL combine nearby pivot levels into price zones using an ATR-relative tolerance and SHALL report the evidence supporting each zone.

#### Scenario: Nearby pivots form a zone
- **WHEN** two or more confirmed levels are within the configured ATR-relative tolerance
- **THEN** the system SHALL report a zone with its bounds, touch count, latest test, and distance from the current price

#### Scenario: No usable ATR is available
- **WHEN** the candle sample is too small to calculate ATR
- **THEN** the system SHALL mark support/resistance unavailable rather than inventing a tolerance

### Requirement: Identify breached zones
The system SHALL distinguish active zones from zones breached by a confirmed candle close beyond the zone with an ATR-relative buffer.

#### Scenario: Price closes beyond a zone
- **WHEN** a confirmed candle close moves beyond a zone boundary by the configured ATR-relative buffer
- **THEN** the system SHALL mark the zone as breached and identify the breach direction and candle time

#### Scenario: Price only tests a zone
- **WHEN** a candle touches or crosses a zone intraday but closes within the zone
- **THEN** the system SHALL keep the zone active and SHALL NOT label it a confirmed breakout
