---
description: OpenCode Remote Host Management & Automation
agent: orchestrator
---

Manage and query remote OpenCode SSH instances, tunnels, file sync, and host status.

Usage:
`/remote [status|serve|tunnel|stop|sync|list|provision|connect|config] [host]`

Behavior:
- **`status [host]`** (or default with no args): Check SSH reachability, headless service state, and local port-forwarding tunnels.
- **`serve <host>`**: Start the headless `opencode serve` daemon on remote and open a local tunnel.
- **`tunnel <host>`**: Establish an SSH port-forwarding tunnel to the remote OpenCode instance.
- **`stop <host>`**: Teardown the SSH tunnel and/or stop remote daemon.
- **`sync <host> [local_dir] [remote_dir]`**: Bi-directional file synchronization via rsync.
- **`list`**: List all configured SSH hosts and connection status.
- **`provision <host>`**: Automated remote installation of OpenCode.
- **`config [always|remote-only]`**: Configure footer status display mode (`always` or `remote-only`).
