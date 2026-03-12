v1.0.0
STABLE

---

v1.1.0

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
