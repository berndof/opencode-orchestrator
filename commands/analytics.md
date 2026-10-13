---
description: Toggle OpenCode System Analytics dashboard
agent: orchestrator
---

Manage and query the OpenCode System Analytics dashboard.

Usage:
`/analytics [start|stop|status|cli|alerts]`

Behavior:
- **`status`** (or default with no args): Check if dashboard is running on port 8765 (`~/tools/orchestrator_analytics/launch.sh status`). If running, report URL (`http://localhost:8765`) and status. If stopped, report stopped state.
- **`start`**: Start the web dashboard in background (`~/tools/orchestrator_analytics/launch.sh start`). Report URL (`http://localhost:8765`).
- **`stop`**: Stop the running dashboard server (`~/tools/orchestrator_analytics/launch.sh stop`).
- **`cli`**: Run the CLI output or display summary (`~/tools/orchestrator_analytics/launch.sh cli`).
- **`alerts`**: Report only the actionable findings, newest severity first, each with its suggested action. Use this before changing agent configuration — it is the fastest way to see which threshold is currently broken.

CLI report sections:
- **Overall telemetry** — agent sessions, real subagent delegations (with failed count), tokens, cost.
- **Ideation vs execution** — IER plus `coverage %`, the share of tokens actually classified. Coverage below 100% means an agent is missing from the roster classification.
- **Subagent usage & step health** — per-agent calls, share, avg/median/P95 steps, breach rate, tokens, cost, error rate.
- **Routing breakdown** — sessions classified `solo` / `specialist` / `heavy` / `mixed`, cost carried by the heavy route, dispatch targets, and any target outside the agent roster.
- **Step-ceiling breach root causes** — for each breach, the data-backed reason: `recon without edits`, `one tool repeated`, `tool errors`, `over-delegation`, `failed dispatch`, or `no data-backed cause` (the ceiling is wrong, not the behaviour).
- **Alerts** — cost concentration, low plan completion rate, per-agent breach rate, per-agent tool error rate, low actionability, failed dispatches, unknown dispatch targets. Each alert carries a concrete suggested action.

Thresholds are env-overridable (`ALERT_PCR_MIN`, `ALERT_COST_CONCENTRATION_MAX`, `ALERT_BREACH_RATE_MAX`,
`ALERT_ERROR_RATE_MAX`, `ALERT_PAI_MIN`, `ALERT_FANOUT_MAX`) — see `orchestrator_analytics/config.py`.
