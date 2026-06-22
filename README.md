# Support Engineer Mission Control

A Chrome/Edge browser extension that reads the active Salesforce queue page and turns it into live queue intelligence.

## Features
- Queue State (Controlled / Busy / Fire Fighting)
- Today's Priorities — bucket-sorted action stream
- SLA Radar using Response Time Remaining (Min)
- Missing Product & Missing KB detection
- Active Work Queue breakdown by status
- Case Age Health (Fresh / Ripe / Rotting)
- Reminder Candidates for Resolved Pending Confirmation
- Engineering Watchlist (PAR / ASD / Hold)

## Notes
- Parses Salesforce queue data by column header name, never by position.
- Active Support cases and Engineering Dependency (PAR) cases processed independently.
- KB link rate is tracked separately on the TSE dashboard.
