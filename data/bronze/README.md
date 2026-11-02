# Bronze Tier (Standardized Ingestion)

## Overview
Cleans and standardizes raw inputs into the strictly enforced 10-column canonical schema.

## Schema Contract
`[DateTime, LAT, LON, SOG, COG, Heading, Name, IMO, Type, Status]`
- Standardized ISO-8601 UTC datetimes
- Coordinate bounding validation
- Chronological sorting per vessel
