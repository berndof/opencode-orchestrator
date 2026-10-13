---
description: User preferences and collaboration guidelines.
label: human
limit: 5000
read_only: false
---
- Prefer structured, concise, and direct communication without fluff or unnecessary small talk.
- Enforce the sequence Recon -> Design -> Implement -> Verify on primary agents, with strict subagent delegation and tool scoping.
- Never pin `model:` in agent frontmatter: agents inherit the session model so an unavailable model never breaks a subagent. Keep cost control in routing (specialist vs broad task), not in model pins.
- Deny heavy MCP servers (`browser`, `cloudflare`, `omni-remoto`) by default in agent `tools:` blocks; grant only to the specialist that needs them.
- Cost routing: one tool call -> do it yourself; surgical closed spec -> `@coder`/`@worker`; broad or multi-file -> handle in primary mode; max 3 subagents concurrently.
- Never hardcode plan paths, frontmatter, or status values in agent prompts: plans follow whatever convention is active at runtime.
