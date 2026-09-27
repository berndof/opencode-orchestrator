import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

function getLatestPlanFile(cwd: string): { path: string; name: string; content: string } | null {
  const dirsToSearch = [
    join(cwd, ".opencode", "plans"),
    join(cwd, ".opencode", "plan"),
    join(homedir(), ".opencode", "plans"),
    join(homedir(), ".opencode", "plan"),
  ]

  for (const dir of dirsToSearch) {
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir)
          .filter((f) => f.endsWith(".md"))
          .sort((a, b) => b.localeCompare(a)) // Latest timestamp/slug first

        if (files.length > 0) {
          const target = join(dir, files[0])
          const content = readFileSync(target, "utf8")
          return { path: target, name: files[0], content }
        }
      } catch {}
    }
  }
  return null
}

export const tui: TuiPlugin = async (api: any) => {
  let isPanelOpen = false

  const togglePanel = async () => {
    const cwd = api.state?.path?.directory || api.location?.directory || process.cwd()
    const plan = getLatestPlanFile(cwd)

    if (!plan) {
      if (api.ui?.toast) {
        const toastFn = typeof api.ui.toast === "function" ? api.ui.toast : api.ui.toast.show
        toastFn?.({
          title: "Plano Não Encontrado",
          message: "Nenhum arquivo de plano (*.md) encontrado em .opencode/plans/",
          variant: "warning",
          duration: 4000,
        })
      }
      return
    }

    isPanelOpen = !isPanelOpen

    if (api.ui?.slot) {
      try {
        if (isPanelOpen) {
          api.ui.slot({
            append: "session.panel",
            name: "plan.viewer",
            render: () => (
              <box borderStyle="round" borderColor="#38bdf8" padding={1} flexDirection="column">
                <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
                  <text bold fg="#38bdf8">
                    📋 PLANO ATIVO: {plan.name}
                  </text>
                  <text dimColor>
                    [Ctrl+G / /plan fechar]
                  </text>
                </box>
                <scrollbox flexGrow={1}>
                  <text>{plan.content}</text>
                </scrollbox>
                <box marginTop={1} fg="#94a3b8">
                  <text dimColor>Caminho: {plan.path}</text>
                </box>
              </box>
            ),
          })
          if (api.ui?.toast) {
            const toastFn = typeof api.ui.toast === "function" ? api.ui.toast : api.ui.toast.show
            toastFn?.({
              title: "Painel de Plano Aberto",
              message: `Exibindo ${plan.name}`,
              variant: "info",
              duration: 3000,
            })
          }
        } else {
          api.ui.slot({
            remove: "session.panel",
            name: "plan.viewer",
          })
        }
      } catch (err: any) {
        // Fallback for dialog view if slots render error
        if (api.ui?.dialog?.alert) {
          await api.ui.dialog.alert({
            title: `📋 Plano Ativo: ${plan.name}`,
            message: plan.content,
          })
        }
      }
    } else if (api.ui?.dialog?.alert) {
      await api.ui.dialog.alert({
        title: `📋 Plano Ativo: ${plan.name}`,
        message: plan.content,
      })
    }
  }

  // Register command in palette, keymaps, and slash command
  if (api.keymap?.layer) {
    try {
      api.keymap.layer(() => ({
        mode: "global",
        priority: 60,
        commands: [
          {
            id: "plan.toggle",
            title: "Plan Viewer (Artifact)",
            group: "Plan",
            palette: true,
            slash: { name: "plan", aliases: ["plano"], arguments: false },
            enabled: () => true,
            suggested: true,
            run: () => togglePanel(),
          },
        ],
        bindings: [
          {
            key: "ctrl+g",
            command: "plan.toggle",
          },
        ],
      }))
    } catch {}
  }
}

export default {
  id: "opencode.plan-panel",
  tui,
}
