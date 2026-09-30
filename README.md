# OpenCode Orchestrator Suite

Production-grade multi-agent orchestration ecosystem and plugin suite for **OpenCode** featuring dual-mode execution (Plan vs Build), TUI artifacts panel, strict MCP tool isolation, and a 2-level hierarchical memory model.

---

## 📐 Architecture Topology

```mermaid
graph TD
    User([User Request]) --> Orch[Orchestrator Controller]
    
    subgraph Planning & Ideation Mode
        Orch -->|Socratic Ideation & Diagrams| Arch[Architect Subagent]
        Orch -->|State & Memory Sync| Lib[Librarian Subagent]
        Orch -->|Plan Panel TUI & Artifacts| PlanPanel[Plan Panel Plugin]
    end

    subgraph Build & Execution Mode
        Orch -->|Production Code| Coder[Coder Subagent]
        Orch -->|Test Verification| Tester[Tester Subagent]
        Orch -->|Code Review| Reviewer[Reviewer Subagent]
        Orch -->|Bug Diagnosis| Debugger[Debugger Subagent]
        Orch -->|Documentation| Documenter[Documenter Subagent]
        Orch -->|Closed-spec / Shell Fallback| Worker[Worker Subagent]
        Orch -->|Fast Reconnaissance| Explorer[Explorer Subagent]
    end

    subgraph Specialized MCP Domains, Infra & Remote
        Worker -->|DNS/WAF/Workers| CF[Cloudflare Subagent]
        Worker -->|Browser Automation| Browser[Browser Subagent]
        Orch -->|Containers / Docker / Services| Infra[Infra Subagent]
        Orch -->|Remote Tunnel & SSHFS| Remote[OpenCode Remote CLI / Plugin]
    end

    Lib <-->|Read/Write Memory| ProjectMem[(Project Memory)]
    Lib <-->|Read/Write Memory| GlobalMem[(Global Memory)]

    Worker -->|File Edits / Shell| Codebase[(Workspace Codebase)]
```

---

## 🚀 Key Highlights & Components

### 1. Dual-Mode Execution (Plan vs Build)
- **Plan Mode:** Interactive discovery, socratic dialog with `@architect`, state tracking with `@librarian`, and live plan persistence in `.opencode/plans/`.
- **Build Mode:** Dynamic routing with specialized agents: `@coder/@tester/@reviewer/@debugger/@documenter` for code lifecycle, `@worker` for shell actuation, and `@explorer/@cloudflare/@browser` for recon/infra/web.

### 2. TUI Plan Panel Plugin (`plugins/plan-panel`)
- Interactive SolidJS TUI panel embedded directly in OpenCode.
- View active plan artifacts, status indicators, and live updates.
- Keybinding: `Ctrl+G` to toggle viewer, or slash command `/plans` (`/plan`, `/plano`).

### 3. OpenCode Remote Suite (`scripts/opencode-remote` & `plugins/remote`)
- CLI command `opencode-remote` (and alias `ocd`).
- **One-Click Connect:** `ocd connect <host>` starts remote `opencode serve`, establishes SSH port forwarding, resolves server tokens, and launches the client.
- **SSHFS Mount Mode:** `ocd mount <host> <dir>` to use local models, MCPs, and plugins on remote files.
- **TUI Remote Menu:** `/remote` command with interactive host selector and prompt footer status indicator (`🌐 host` / `💻 local`).

### 4. Strict MCP Tool Isolation & Memory Hierarchy
- High-overhead tool schemas (e.g. Cloudflare, Browser Puppeteer) are scoped strictly to specialist subagents.
- Memory: Level 1 (Committed code on disk) > Level 2 (Project memory / `.opencode/memory/`) > Level 3 (Global memory).

---

## 📦 Prerequisites & System Dependencies

- **Node.js:** `>= 18.0.0`
- **OpenCode:** `>= 0.2.0`
- **System Utilities (for remote/SSHFS):**
  ```bash
  # Debian / Ubuntu / Mint / PopOS
  sudo apt install -y python3 openssh-client sshfs rsync

  # Arch Linux / Manjaro
  sudo pacman -S python openssh sshfs rsync

  # Fedora / RHEL
  sudo dnf install -y python3 openssh-clients sshfs rsync
  ```

---

## 🛠️ Installation & Setup

### Automated Installation (Recommended)

Run the colorized installer to deploy agents, memories, plugins, and CLI tools:

```bash
# Clone the repository
git clone https://github.com/berndof/opencode-orchestrator.git
cd opencode-orchestrator

# Symlink mode (recommended for live editing and dev updates)
./install.sh --symlink

# Or standard copy mode
./install.sh --copy

# Custom destinations
./install.sh --target ~/.config/opencode --bin-dir ~/.local/bin --force
```

### Manual Configuration

1. **Agents:** Copy/symlink `agents/*.md` to `~/.config/opencode/agents/`
2. **Memory:** Copy/symlink `memory/*.md` to `~/.config/opencode/memory/`
3. **Plugins:** Copy/symlink `plugins/*` to `~/.config/opencode/plugins/`
4. **CLI Tools:** Copy `scripts/opencode-remote` to `~/.local/bin/opencode-remote` and create aliases:
   ```bash
   chmod +x ~/.local/bin/opencode-remote
   ln -sf ~/.local/bin/opencode-remote ~/.local/bin/ocd
   ln -sf ~/.local/bin/opencode-remote ~/.local/bin/oc-remote
   ```

---

## 📂 Repository Structure

```
opencode-orchestrator/
├── agents/                  # Specialized agent prompt definitions
│   ├── orchestrator.md      # Controller / Main Orchestrator agent
│   ├── architect.md         # Solution design & Mermaid diagrams
│   ├── coder.md             # Production code implementation specialist
│   ├── tester.md            # Test execution & verification agent
│   ├── reviewer.md          # Static analysis & code review specialist
│   ├── debugger.md          # Root cause analysis & bug fix agent
│   ├── documenter.md        # Technical documentation & markdown agent
│   ├── worker.md            # Shell execution & fallback actuator
│   ├── explorer.md          # Fast code discovery & search
│   ├── librarian.md         # Hierarchical memory & state manager
│   ├── infra.md             # Docker, Compose & Infrastructure specialist
│   ├── cloudflare.md        # Cloudflare DNS/WAF/Workers specialist
│   └── browser.md           # Web search & browser automation agent
├── plugins/                 # OpenCode V2 TUI Plugins (SolidJS)
│   ├── plan-panel/          # Active plan artifact visualizer (Ctrl+G, /plans)
│   │   ├── index.ts
│   │   └── tui.tsx
│   └── remote/              # Remote host selector & footer status (/remote)
│       ├── index.ts
│       └── tui.tsx
├── scripts/                 # CLI utilities
│   └── opencode-remote      # Fast Python-based remote management tool
├── memory/                  # Hierarchical memory blocks
│   ├── persona.md           # Persona & memory guidelines
│   ├── human.md             # Collaboration & interaction preferences
│   ├── global-file-search-rules.md # File search rules
│   └── templates/           # Memory templates
│       └── project.md.template
├── templates/               # Workspace configuration examples
│   └── opencode.json.example
├── package.json             # NPM dependencies & plugin types
├── tsconfig.json            # TypeScript & SolidJS JSX config
├── install.sh               # Colorized installer with symlink & backup support
├── LICENSE                  # MIT License
└── README.md                # Documentation & Architecture Overview
```

---

## 📄 License

Distributed under the [MIT License](LICENSE). Copyright © 2026 Bernardo.
