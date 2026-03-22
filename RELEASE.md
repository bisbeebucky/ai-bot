# RELEASES

## v1.3.0

### Added
- Natural-language read-only prompts for common questions such as:
  - balance
  - debts
  - recurring bills
  - spending summary
  - net worth
  - emergency fund
  - forecast
  - overdraft risk
  - lowest balance
  - upcoming income
  - upcoming bills
  - payday
  - until payday
  - balance on date

### Changed
- Refactored repeated read/query logic into shared service layers:
  - `queryService`
  - `forecastQueryService`
  - `recurringQueryService`
- Updated chat shortcuts and slash-command reads to use shared service logic where appropriate
- Improved maintainability by reducing duplicated SQL and duplicated forecast logic

### Fixed
- Improved `/why` handling for cases with no upcoming forecast events
- Improved forecast-related consistency between chat prompts and slash commands

### Testing
- Added automated tests for:
  - `queryService`
  - `forecastQueryService`
  - `recurringQueryService`
  - `simulateCashflow`

---

## v1.2.0

Previous release content unavailable or not yet reconstructed.

---

## v1.1.0

Previous release content unavailable or not yet reconstructed.
