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

### Added

- Added `/reconcile` to align `bank` or `savings` with a real-world balance by posting a reconciliation adjustment entry.
- Added inline confirmation flow for reconciliation to reduce accidental balance changes.

### Improved

- Improved `/autopilot` into a stronger cockpit-style recommendation command with clearer guidance:
  - headline
  - why
  - do now
  - watch next
  - next commands
- Improved `/status` as a stronger financial cockpit snapshot with:
  - balances
  - net worth
  - lowest projected balance
  - 30-day income / expenses / net
  - recurring 30-day net
  - projected 30-day balance
  - debt metrics
  - upcoming recurring items
- Improved `/untilpayday` with clearer status framing and better near-term cash guidance.
- Improved `/why` as a clearer explanation tool for forecast dips.
- Improved `/help` overview to surface the core cockpit commands more clearly.
- Cleaned up `HELP.md` to better reflect the current command surface and product direction.

### Changed

- Folded `/cashflow_detail` into `/cashflow detail`.
- Folded `/monthly_detail` into `/monthly detail`.
- Folded `/retirement_fi` into `/retirement fi`.
- Repositioned the bot around a stronger cockpit flow centered on:
  - `/status`
  - `/untilpayday`
  - `/why`
  - `/focus`
  - `/autopilot`
  - `/forecast_graph`

### Removed

- Removed `/next` in favor of `/focus` and `/autopilot`.
- Removed `/burnrate` in favor of `/burn`.
- Removed `/dashboard` as overlapping with `/status`.
- Removed `/danger` as overlapping with `/untilpayday` and `/why`.
- Removed `/today` as overlapping with snapshot commands like `/money` and `/status`.

### Fixed

- Fixed help/documentation drift after command consolidation.
- Improved consistency in debt and net-worth handling in `/financial_health`.
- Cleaned up stray formatting / display issues that were leaking into some handlers.

---

## v1.1.0

This release adds a new transfer command, improves debt listing and deletion workflows, adds confirmation buttons to destructive actions, and formats graph command summaries for cleaner output.

### Added

- `/transfer` for moving money between bank and savings
- `/debts_list` for clearer debt listing
- Numeric IDs in debt listings for easier `/debt_delete <id>`

### Improved

- Confirmation buttons for:
  - `/undo`
  - `/debt_delete`
  - `/recurring_delete`
- Formatted/aligned output for:
  - `/future_graph`
  - `/dashboard_graph`
  - `/money_graph`
  - `/milestones_graph`
  - `/debt_compare_graph`
- Help text and command registry entries

### Notes

- Backward-compatible feature release
- Appropriate minor version bump from `v1.0.0` to `v1.1.0`

---

## Future Release Notes

## AI / model cleanup

This release standardizes the bot on **OpenRouter only**.

### Changes

- removed the old mixed OpenAI/OpenRouter behavior
- `bootstrap/openai.js` now uses only `OPENROUTER_API_KEY`
- `index.js` now requires `OPENROUTER_API_KEY`
- added `utils/model.js` as the single source of truth for model selection
- updated chat, analysis, and `/ocstatus` to use the shared model resolver
- added `max_tokens` caps to reduce OpenRouter credit overruns

### Result

- runtime model selection is now consistent across the bot
- `/ocstatus` reports the same requested model the bot uses
- OpenRouter-only deployments are simpler and more predictable
