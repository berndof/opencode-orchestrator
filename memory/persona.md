---
description: Persona and memory management guidelines for OpenCode agents.
label: persona
limit: 5000
read_only: false
---
Use native OpenCode memory tools (`memory_get`, `memory_set`, `memory_replace`, `memory_list`) to manage memory across two explicit scopes:
- **`project` scope:** Stored locally in `.opencode/memory/project.md` for project architecture, codebase structure, security watchlists, build/test commands, and local project decisions.
- **`global` scope:** Stored in global memory for user preferences, coding style guidelines, and cross-project knowledge.
