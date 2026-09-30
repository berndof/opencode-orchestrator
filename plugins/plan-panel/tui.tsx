import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { createSignal } from "solid-js"

export type PlanStatus = "draft" | "approved" | "in_progress" | "completed" | "rejected" | string
export type PlanScope = "project" | "global" | "workspace"

export type Progress = { done: number; pending: number; total: number; percent: number }

export type Plan = {
  path: string
  name: string
  title: string
  content: string
  status: PlanStatus
  sessionID: string | null
  sessions: string[]
  mtime: number
  progress: Progress
  scope: PlanScope
  scopeLabel: string
}

export type Action = { key: string; bind: string; label: string; color: string; run: () => void }

export type SessionRegistry = Record<
  string,
  {
    activePlan?: string
    plans?: string[]
    lastUpdated?: string
  }
>

const PANEL_NAME = "plan.viewer"

export const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  draft: { label: "DRAFT", color: "#facc15", icon: "📝" },
  approved: { label: "APROVADO", color: "#38bdf8", icon: "🚀" },
  in_progress: { label: "ANDAMENTO", color: "#a78bfa", icon: "⏳" },
  completed: { label: "FINALIZADO", color: "#22c55e", icon: "✅" },
  rejected: { label: "REJEITADO", color: "#f87171", icon: "❌" },
}

export const SCOPE_COLORS: Record<PlanScope, string> = {
  project: "#38bdf8",
  global: "#c084fc",
  workspace: "#fbbf24",
}

export function truncateEnd(str: string, maxLen = 34): string {
  if (!str) return ""
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + "..."
}

export function stripFrontmatter(content: string): string {
  if (content.startsWith("---")) {
    const end = content.indexOf("\n---", 3)
    if (end !== -1) {
      return content.slice(end + 4).trimStart()
    }
  }
  return content
}

export function sanitizeTitle(str: string): string {
  return str
    .replace(/^plano(\s+de\s+execu[cç][aã]o)?\s*:\s*/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}\s*[-—:]\s*/, "")
    .replace(/["`]/g, "")
    .trim()
}

export function extractTitle(content: string, filename: string): string {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fm?.[1]) {
    const titleMatch = fm[1].match(/^title\s*:\s*["']?([^"'\r\n]+)/m)
    if (titleMatch?.[1]?.trim()) return sanitizeTitle(titleMatch[1].trim())
  }
  const h1Match = content.match(/^#\s+(.+)$/m)
  if (h1Match?.[1]?.trim()) return sanitizeTitle(h1Match[1].trim())

  const cleanName = filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-?/, "")
  return cleanName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

export function formatPlanOptionTitle(p: Plan, isActive: boolean): string {
  const meta = STATUS_META[p.status] ?? { label: p.status.toUpperCase(), icon: "📄" }
  const statusTag = isActive ? `📌 [ATIVO:${meta.label}]` : `${meta.icon} [${meta.label}]`
  const scopeTag = p.scope === "project" ? `📁 [${p.scopeLabel}]` : p.scope === "global" ? `🌐 [Global]` : `📦 [${p.scopeLabel}]`
  const titleTrunc = truncateEnd(p.title || p.name, 36)
  const prog = p.progress.total > 0 ? `(${p.progress.done}/${p.progress.total})` : ""

  return `${statusTag} ${scopeTag} ${titleTrunc} ${prog}`.replace(/\s+/g, " ").trim()
}

export function discoverAllPlans(cwd: string): {
  plans: Plan[]
  projectDirs: { dir: string; label: string }[]
  globalDirs: { dir: string; label: string }[]
  workspaceDirs: { dir: string; label: string }[]
} {
  const homeDir = homedir()
  let homeReal = homeDir
  let cwdReal = cwd
  try { homeReal = existsSync(homeDir) ? realpathSync(homeDir) : homeDir } catch {}
  try { cwdReal = existsSync(cwd) ? realpathSync(cwd) : cwd } catch {}
  const isHome = cwdReal === homeReal

  const projectDirs: { dir: string; label: string }[] = []
  const globalDirs: { dir: string; label: string }[] = []
  const workspaceDirs: { dir: string; label: string }[] = []

  const seenDirs = new Set<string>()
  const seenPaths = new Set<string>()
  const plans: Plan[] = []

  function addDir(dir: string, scope: PlanScope, label: string) {
    if (!existsSync(dir)) return
    let real = dir
    try { real = realpathSync(dir) } catch {}
    if (seenDirs.has(real)) return
    seenDirs.add(real)

    if (scope === "project") projectDirs.push({ dir, label })
    else if (scope === "global") globalDirs.push({ dir, label })
    else workspaceDirs.push({ dir, label })

    try {
      const files = readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("."))
      for (const f of files) {
        const full = join(dir, f)
        if (seenPaths.has(full)) continue
        seenPaths.add(full)
        const p = readPlan(full, scope, label)
        if (p) plans.push(p)
      }
    } catch {}
  }

  // 1. Project directories (strictly for current cwd when not in home)
  if (!isHome) {
    const pLabel = basename(cwd)
    addDir(join(cwd, ".opencode", "plans"), "project", pLabel)
    addDir(join(cwd, ".opencode", "plan"), "project", pLabel)
    addDir(join(cwd, "docs", "plans"), "project", pLabel)
  }

  // 2. Global user directories
  addDir(join(homeDir, ".opencode", "plans"), "global", "Global (~)")
  addDir(join(homeDir, ".opencode", "plan"), "global", "Global (~)")

  // 3. Other workspace directories in ~/Workspace/*
  const wsRoot = join(homeDir, "Workspace")
  if (existsSync(wsRoot)) {
    try {
      const subs = readdirSync(wsRoot)
      for (const sub of subs) {
        const fullSub = join(wsRoot, sub)
        try {
          if (!statSync(fullSub).isDirectory()) continue
          let subReal = fullSub
          try { subReal = realpathSync(fullSub) } catch {}
          if (subReal === cwdReal) continue
          addDir(join(fullSub, ".opencode", "plans"), "workspace", sub)
          addDir(join(fullSub, ".opencode", "plan"), "workspace", sub)
          addDir(join(fullSub, "docs", "plans"), "workspace", sub)
        } catch {}
      }
    } catch {}
  }

  return {
    plans: plans.sort((a, b) => b.mtime - a.mtime || b.path.localeCompare(a.path)),
    projectDirs,
    globalDirs,
    workspaceDirs,
  }
}

export function primaryPlanDir(cwd: string, targetScope: "project" | "global" = "project"): string {
  const homeDir = homedir()
  let homeReal = homeDir
  let cwdReal = cwd
  try { homeReal = existsSync(homeDir) ? realpathSync(homeDir) : homeDir } catch {}
  try { cwdReal = existsSync(cwd) ? realpathSync(cwd) : cwd } catch {}
  const isHome = cwdReal === homeReal

  if (targetScope === "project" && !isHome) {
    const local = join(cwd, ".opencode", "plans")
    try {
      mkdirSync(local, { recursive: true })
      return local
    } catch {}
  }

  const globalDir = join(homeDir, ".opencode", "plans")
  try {
    mkdirSync(globalDir, { recursive: true })
    return globalDir
  } catch {}
  return globalDir
}

export function getRegistryPath(dir: string): string {
  return join(dir, ".session_plans.json")
}

export function loadSessionRegistry(dir: string): SessionRegistry {
  try {
    const file = getRegistryPath(dir)
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf8"))
    }
  } catch {}
  return {}
}

export function saveSessionRegistry(dir: string, registry: SessionRegistry) {
  try {
    const file = getRegistryPath(dir)
    writeFileSync(file, JSON.stringify(registry, null, 2), "utf8")
  } catch {}
}

export function readStatus(content: string): PlanStatus {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fm?.[1]) {
    const match = fm[1].match(/^status\s*:\s*["']?([^\s"']+)/m)
    if (match?.[1]) return match[1].toLowerCase()
  }
  const inText = content.match(/\*\*Status:\*\*\s*([^\n\r*]+)/i)
  if (inText?.[1]) {
    const val = inText[1].toUpperCase()
    if (val.includes("APROV")) return "approved"
    if (val.includes("CONCLU") || val.includes("FINAL") || val.includes("COMPLET")) return "completed"
    if (val.includes("ANDAMENTO") || val.includes("PROGRESS")) return "in_progress"
    if (val.includes("REJEIT") || val.includes("NEGAD")) return "rejected"
    if (val.includes("PROP") || val.includes("DRAFT")) return "draft"
  }
  return "draft"
}

export function readSessions(content: string): { sessionID: string | null; sessions: string[] } {
  const sessionsSet = new Set<string>()
  let primarySession: string | null = null

  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fm?.[1]) {
    const sMatch = fm[1].match(/^session(?:_id)?\s*:\s*["']?([^\s"']+)/m)
    if (sMatch?.[1]) {
      primarySession = sMatch[1].trim()
      sessionsSet.add(primarySession)
    }

    const lines = fm[1].split("\n")
    let inSessionsBlock = false
    for (const line of lines) {
      if (/^sessions\s*:/.test(line)) {
        inSessionsBlock = true
        continue
      }
      if (inSessionsBlock) {
        if (/^\s*-\s*([^\s#]+)/.test(line)) {
          const id = line.replace(/^\s*-\s*/, "").trim().replace(/["']/g, "")
          if (id) sessionsSet.add(id)
        } else if (/^[a-zA-Z0-9_-]+\s*:/.test(line)) {
          inSessionsBlock = false
        }
      }
    }
  }

  return { sessionID: primarySession, sessions: Array.from(sessionsSet) }
}

export function progressOf(content: string): Progress {
  const done = (content.match(/^\s*[-*]\s*\[[xX]\]/gm) ?? []).length
  const pending = (content.match(/^\s*[-*]\s*\[ \]/gm) ?? []).length
  const total = done + pending
  return { done, pending, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

export function progressBar(percent: number, width = 10): string {
  const filled = Math.round((percent / 100) * width)
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled))
}

export function applyStatus(content: string, status: string, sessionID?: string | null): string {
  const today = new Date().toISOString().slice(0, 10)
  const lines = content.split("\n")

  let end = -1
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        end = i
        break
      }
    }
  }

  if (end === -1) {
    const sessionLine = sessionID ? `session: ${sessionID}\n` : ""
    return `---\nstatus: ${status}\n${sessionLine}updated: ${today}\n---\n\n${content}`
  }

  const block = lines.slice(1, end)
  const set = (key: string, value: string) => {
    const idx = block.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l))
    if (idx >= 0) block[idx] = `${key}: ${value}`
    else block.unshift(`${key}: ${value}`)
  }

  set("status", status)
  set("updated", today)
  if (sessionID) {
    set("session", sessionID)
  }

  return [lines[0], ...block, ...lines.slice(end)].join("\n")
}

export function readPlan(path: string, scope?: PlanScope, scopeLabel?: string): Plan | null {
  try {
    const content = readFileSync(path, "utf8")
    const filename = path.split("/").pop() ?? path
    let mtime = 0
    try {
      mtime = statSync(path).mtimeMs
    } catch {}
    const { sessionID, sessions } = readSessions(content)

    let s = scope ?? "global"
    let sl = scopeLabel ?? "Global (~)"
    if (!scope) {
      if (path.includes("/Workspace/")) {
        const parts = path.split("/Workspace/")[1]?.split("/")
        s = "workspace"
        sl = parts?.[0] ?? "Workspace"
      }
    }

    return {
      path,
      name: filename,
      title: extractTitle(content, filename),
      content,
      status: readStatus(content),
      sessionID,
      sessions,
      mtime,
      progress: progressOf(content),
      scope: s,
      scopeLabel: sl,
    }
  } catch {
    return null
  }
}

export function getSessionScopedPlans(
  cwd: string,
  sessionID: string | null,
  scopeFilter: "project" | "global" | "workspace" | "all" | string = "project"
): {
  plans: Plan[]
  currentSession: Plan[]
  otherPlans: Plan[]
  sessionActivePlan: Plan | null
  counts: { project: number; global: number; workspace: number; all: number }
  scopeFilter: string
} {
  const discovered = discoverAllPlans(cwd)
  const all = discovered.plans

  const counts = {
    project: all.filter((p) => p.scope === "project").length,
    global: all.filter((p) => p.scope === "global").length,
    workspace: all.filter((p) => p.scope === "workspace").length,
    all: all.length,
  }

  let filtered = all
  if (scopeFilter === "project") {
    filtered = all.filter((p) => p.scope === "project")
  } else if (scopeFilter === "global") {
    filtered = all.filter((p) => p.scope === "global")
  } else if (scopeFilter === "workspace") {
    filtered = all.filter((p) => p.scope === "workspace")
  } else if (scopeFilter !== "all" && scopeFilter !== "auto") {
    filtered = all.filter(
      (p) => p.scopeLabel.toLowerCase() === scopeFilter.toLowerCase() || p.scope === scopeFilter
    )
  }

  const allDirs = [
    ...discovered.projectDirs,
    ...discovered.globalDirs,
    ...discovered.workspaceDirs,
  ].map((d) => d.dir)

  let registryActivePath: string | null = null
  const registryPlanPaths = new Set<string>()

  if (sessionID) {
    const sClean = sessionID.trim().toLowerCase()
    for (const dir of allDirs) {
      const reg = loadSessionRegistry(dir)
      // Check exact or case-insensitive match
      for (const key of Object.keys(reg)) {
        if (key.trim().toLowerCase() === sClean) {
          if (reg[key].activePlan) registryActivePath = reg[key].activePlan!
          reg[key].plans?.forEach((p) => registryPlanPaths.add(p))
        }
      }
    }
  }

  const currentSession: Plan[] = []
  const otherPlans: Plan[] = []

  for (const plan of filtered) {
    const sClean = sessionID ? sessionID.trim().toLowerCase() : null
    const belongs = Boolean(
      sClean &&
        ((plan.sessionID && plan.sessionID.trim().toLowerCase() === sClean) ||
          plan.sessions.some((s) => s.trim().toLowerCase() === sClean) ||
          registryPlanPaths.has(plan.path) ||
          registryActivePath === plan.path)
    )

    if (belongs) {
      currentSession.push(plan)
    } else {
      otherPlans.push(plan)
    }
  }

  // Active plan for THIS session strictly:
  let sessionActivePlan: Plan | null = null
  if (sessionID) {
    if (registryActivePath) {
      sessionActivePlan = currentSession.find((p) => p.path === registryActivePath) ?? null
    }
    if (!sessionActivePlan && currentSession.length > 0) {
      sessionActivePlan =
        currentSession.find((p) => p.status === "in_progress" || p.status === "approved" || p.status === "draft") ??
        currentSession[0]
    }
  }

  return { plans: filtered, currentSession, otherPlans, sessionActivePlan, counts, scopeFilter }
}

export function recordPlanForSession(cwd: string, sessionID: string, planPath: string, makeActive = true) {
  const discovered = discoverAllPlans(cwd)
  const allDirs = [
    ...discovered.projectDirs,
    ...discovered.globalDirs,
    ...discovered.workspaceDirs,
  ].map((d) => d.dir)

  for (const dir of allDirs) {
    let realDir = dir
    let realPlan = planPath
    try { realDir = existsSync(dir) ? realpathSync(dir) : dir } catch {}
    try { realPlan = existsSync(planPath) ? realpathSync(planPath) : planPath } catch {}

    if (realPlan.startsWith(realDir) || planPath.startsWith(dir)) {
      const reg = loadSessionRegistry(dir)
      const entry = reg[sessionID] ?? { plans: [] }
      const plans = new Set(entry.plans ?? [])
      plans.add(planPath)
      entry.plans = Array.from(plans)
      if (makeActive) {
        entry.activePlan = planPath
      }
      entry.lastUpdated = new Date().toISOString()
      reg[sessionID] = entry
      saveSessionRegistry(dir, reg)
      break
    }
  }
}

/**
 * OpenCode V2 TUI plugin contract:
 *   export default { id: string, setup: (context) => Promise<void> }
 */
export default {
  id: "opencode.plan-panel",
  setup: async (api: any) => {
    let currentPlan: Plan | null = null
    let panelSessionID: string | null = null

    // Default scope is strictly "project" (current project plans only)
    let activeScopeFilter: "project" | "global" | "workspace" | "all" | string = "project"

    const activeSession = (): string | null =>
      panelSessionID || api?.state?.session?.id || api?.state?.sessionID || null

    const [rev, setRev] = createSignal(0)
    const bump = () => setRev((v) => v + 1)

    const cwd = () =>
      api?.location?.directory ||
      api?.state?.path?.directory ||
      api?.state?.path?.worktree ||
      process.cwd()

    const isHome = () => {
      const cur = cwd()
      try {
        return existsSync(cur) && existsSync(homedir()) && realpathSync(cur) === realpathSync(homedir())
      } catch {
        return cur === homedir()
      }
    }

    const showToast = (opts: {
      title?: string
      message: string
      variant?: "info" | "warning" | "error" | "success"
      duration?: number
    }) => {
      try {
        if (typeof api?.ui?.toast?.show === "function") api.ui.toast.show(opts)
        else if (typeof api?.ui?.toast === "function") api.ui.toast(opts)
      } catch {}
    }

    const showAlert = async (title: string, message: string) => {
      try {
        if (api?.ui?.dialog?.alert) {
          await api.ui.dialog.alert({ title, message })
          return
        }
      } catch {}
      showToast({ title, message: message.slice(0, 300), variant: "info", duration: 8000 })
    }

    const confirmFrom = async (
      title: string,
      message: string,
      confirmLabel = "Confirmar"
    ): Promise<boolean> => {
      try {
        if (api?.ui?.dialog?.confirm) {
          return Boolean(
            await api.ui.dialog.confirm({
              title,
              message,
              label: { confirm: confirmLabel, cancel: "Cancelar" },
            })
          )
        }
      } catch {}
      try {
        if (api?.ui?.dialog?.select) {
          const choice = await api.ui.dialog.select({
            title: `${title} — ${message}`,
            options: [
              { title: confirmLabel, value: "yes" },
              { title: "Cancelar", value: "no" },
            ],
          })
          return choice === "yes"
        }
      } catch {}
      return false
    }

    const promptFrom = async (title: string, placeholder?: string): Promise<string | undefined> => {
      try {
        if (api?.ui?.dialog?.prompt) return await api.ui.dialog.prompt({ title, placeholder })
      } catch {}
      return undefined
    }

    const shortPath = (path: string) => path.replace(homedir(), "~")

    const resolvePlan = (selector?: string): Plan | null => {
      const curCwd = cwd()
      const effectiveScope = isHome() ? "global" : activeScopeFilter
      const sid = activeSession()

      const slug = (selector ?? "").trim().toLowerCase()
      if (slug && slug !== "latest") {
        const discovered = discoverAllPlans(curCwd)
        const match = discovered.plans.find(
          (p) =>
            p.name.toLowerCase().includes(slug) ||
            p.title.toLowerCase().includes(slug) ||
            p.path.toLowerCase().includes(slug)
        )
        if (match) return match
      }

      const { sessionActivePlan, currentSession } = getSessionScopedPlans(curCwd, sid, effectiveScope)
      return sessionActivePlan ?? currentSession[0] ?? null
    }

    const reloadPlan = () => {
      if (!currentPlan) return
      const fresh = readPlan(currentPlan.path, currentPlan.scope, currentPlan.scopeLabel)
      if (fresh) currentPlan = fresh
      bump()
    }

    const toggleScope = () => {
      if (activeScopeFilter === "project") {
        activeScopeFilter = "global"
      } else {
        activeScopeFilter = "project"
      }
      currentPlan = resolvePlan()
      bump()
      const pLabel = basename(cwd())
      const scopeName = activeScopeFilter === "project" ? `Projeto: ${pLabel}` : "Global (~/.opencode)"
      showToast({
        title: "Escopo Alternado",
        message: `Visualizando planos de [${scopeName}]`,
        variant: "info",
        duration: 3000,
      })
    }

    // --- messaging to the active session -------------------------------

    const sendPrompt = async (text: string): Promise<boolean> => {
      const sessionID = activeSession()
      const client = api?.client
      if (!sessionID) {
        showToast({
          title: "Sem sessão ativa",
          message: "Abra o painel dentro de uma sessão para enviar comandos ao agente.",
          variant: "warning",
          duration: 5000,
        })
        return false
      }
      if (typeof client?.session?.prompt !== "function") {
        showToast({
          title: "API indisponível",
          message: "client.session.prompt não está disponível nesta build.",
          variant: "warning",
          duration: 5000,
        })
        return false
      }
      try {
        await client.session.prompt({ sessionID, text })
        return true
      } catch (e) {
        showToast({
          title: "Falha ao enviar",
          message: String(e),
          variant: "error",
          duration: 6000,
        })
        return false
      }
    }

    // --- plan lifecycle & actions ---------------------------------------

    const setStatus = (status: PlanStatus) => {
      if (!currentPlan) return false
      try {
        const sid = activeSession()
        const next = applyStatus(currentPlan.content, status, sid)
        writeFileSync(currentPlan.path, next, "utf8")
        currentPlan = {
          ...currentPlan,
          content: next,
          status,
          sessionID: sid || currentPlan.sessionID,
          progress: progressOf(next),
        }
        if (sid) {
          recordPlanForSession(cwd(), sid, currentPlan.path, true)
        }
        bump()
        return true
      } catch (e) {
        showToast({
          title: "Falha ao gravar status",
          message: String(e),
          variant: "error",
          duration: 6000,
        })
        return false
      }
    }

    const createPlanDialog = async (targetScope: "project" | "global" = "project") => {
      const sid = activeSession()
      const curCwd = cwd()
      const actualScope = (targetScope === "project" && isHome()) ? "global" : targetScope
      const scopeName = actualScope === "project" ? `Projeto (${basename(curCwd)})` : "Global (~/.opencode)"

      const slugInput = await promptFrom(
        `Nome / Título do novo plano [${scopeName}]`,
        "ex: otimizacao-queries-db"
      )
      if (!slugInput || !slugInput.trim()) return

      const cleanSlug = slugInput
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
      const today = new Date().toISOString().slice(0, 10)
      const filename = cleanSlug.startsWith("20") ? `${cleanSlug}.md` : `${today}-${cleanSlug}.md`
      const dir = primaryPlanDir(curCwd, actualScope)
      const targetPath = join(dir, filename)

      const title = slugInput.trim()
      const content = [
        `---`,
        `status: draft`,
        sid ? `session: ${sid}` : null,
        `updated: ${today}`,
        `title: "${title}"`,
        `---`,
        ``,
        `# Plano de Execução: ${title}`,
        `**Data:** ${today}`,
        `**Escopo:** ${scopeName}`,
        sid ? `**Sessão:** \`${sid}\`` : null,
        `**Status:** DRAFT / PROPOSTO`,
        ``,
        `---`,
        `## 1. Contexto e Objetivos`,
        `- [ ] Definir escopo e arquitetura`,
        ``,
        `## 2. Checklist de Execução`,
        `- [ ] Passo 1: Especificação inicial`,
        `- [ ] Passo 2: Implementação`,
        `- [ ] Passo 3: Testes e validação`,
      ]
        .filter((l) => l !== null)
        .join("\n")

      try {
        writeFileSync(targetPath, content, "utf8")
        if (sid) {
          recordPlanForSession(curCwd, sid, targetPath, true)
        }
        const newPlan = readPlan(targetPath, actualScope, actualScope === "project" ? basename(curCwd) : "Global (~)")
        if (newPlan) {
          currentPlan = newPlan
          bump()
          showToast({
            title: "Plano Criado",
            message: `${newPlan.title} • Vinculado a esta sessão`,
            variant: "success",
            duration: 4000,
          })
          try {
            api?.ui?.panel?.open?.(PANEL_NAME)
          } catch {}
        }
      } catch (e) {
        showToast({
          title: "Erro ao criar plano",
          message: String(e),
          variant: "error",
          duration: 6000,
        })
      }
    }

    const selectPlanDialog = async (requestedScope?: string) => {
      if (requestedScope) {
        activeScopeFilter = requestedScope
      }

      const sid = activeSession()
      const curCwd = cwd()
      const effectiveScope = isHome() ? "global" : activeScopeFilter

      const { plans: scopedPlans, currentSession, otherPlans, sessionActivePlan, counts } =
        getSessionScopedPlans(curCwd, sid, effectiveScope)

      type Option = { title: string; value: string; description?: string }
      const options: Option[] = []
      const pLabel = basename(curCwd)

      // Section 1: Toggle Scope (First prominent option)
      if (!isHome()) {
        if (effectiveScope === "project") {
          options.push({
            title: `🔄 [Alternar Escopo: Ver Planos Globais (~/.opencode)]`,
            description: `Exibir os ${counts.global} planos globais compartilhados (atualmente no projeto ${pLabel})`,
            value: "__TOGGLE_SCOPE__:global",
          })
        } else {
          options.push({
            title: `🔄 [Alternar Escopo: Ver Apenas Projeto Atual (${pLabel})]`,
            description: `Filtrar apenas os ${counts.project} planos de ${pLabel} (atualmente em ${effectiveScope})`,
            value: "__TOGGLE_SCOPE__:project",
          })
        }
      }

      // Section 2: Plans in current session
      if (currentSession.length > 0) {
        for (const p of currentSession) {
          const isActive = sessionActivePlan?.path === p.path
          const titleLine = formatPlanOptionTitle(p, isActive)
          options.push({
            title: titleLine,
            description: `📄 ${p.name} • Sessão atual • ${p.progress.percent}% concluído`,
            value: p.path,
          })
        }
      }

      // Section 3: Other plans in this scope
      for (const p of otherPlans) {
        const titleLine = formatPlanOptionTitle(p, false)
        const sessionHint = p.sessionID ? `Sessão ${p.sessionID.slice(0, 8)}...` : "Não vinculado"
        options.push({
          title: titleLine,
          description: `📄 ${p.name} • ${sessionHint} • ${p.progress.percent}% concluído`,
          value: p.path,
        })
      }

      // If scope has zero plans:
      if (scopedPlans.length === 0) {
        options.push({
          title: `⚠️ [Nenhum plano encontrado no escopo: ${effectiveScope === "project" ? pLabel : effectiveScope}]`,
          description: `Crie um novo plano abaixo ou alterne para ver planos globais`,
          value: "__NOOP__",
        })
      }

      // Section 4: Create new plan actions
      if (!isHome()) {
        options.push({
          title: `➕ [Criar Novo Plano no Projeto (${pLabel})]`,
          description: `Cria .md em ${pLabel}/.opencode/plans/ vinculado à sessão`,
          value: "__CREATE__:project",
        })
      }
      options.push({
        title: `➕ [Criar Novo Plano Global (~/.opencode)]`,
        description: `Cria .md global em ~/.opencode/plans/ compartilhado`,
        value: "__CREATE__:global",
      })

      // Section 5: View all unified
      if (effectiveScope !== "all") {
        options.push({
          title: `📋 [Ver Todos os Planos de Todos os Projetos (Unificado)]`,
          description: `Exibir todos os ${counts.all} planos encontrados`,
          value: "__TOGGLE_SCOPE__:all",
        })
      }

      const scopeHeader =
        effectiveScope === "project"
          ? `Projeto: ${pLabel}`
          : effectiveScope === "global"
          ? "Global (~)"
          : effectiveScope === "workspace"
          ? "Outros Projetos"
          : "Todos os Escopos"

      let choice: string | undefined
      try {
        if (api?.ui?.dialog?.select) {
          choice = await api.ui.dialog.select({
            title: `📋 Planos [${scopeHeader}] (${scopedPlans.length} no escopo)`,
            options,
          })
        }
      } catch {}

      if (!choice || choice === "__NOOP__") return

      if (choice.startsWith("__TOGGLE_SCOPE__:")) {
        const nextScope = choice.replace("__TOGGLE_SCOPE__:", "")
        activeScopeFilter = nextScope
        await selectPlanDialog(nextScope)
        return
      }

      if (choice.startsWith("__CREATE__:")) {
        const targetScope = choice.replace("__CREATE__:", "") as "project" | "global"
        await createPlanDialog(targetScope)
        return
      }

      const target = readPlan(choice)
      if (target) {
        currentPlan = target
        if (sid) {
          recordPlanForSession(curCwd, sid, target.path, true)
        }
        bump()
        showToast({
          title: "Plano Selecionado",
          message: `${target.title} [${(STATUS_META[target.status]?.label ?? target.status).toUpperCase()}] • Vinculado à sessão`,
          variant: "info",
          duration: 3000,
        })
        try {
          api?.ui?.panel?.open?.(PANEL_NAME)
        } catch {}
      }
    }

    const editPlan = async () => {
      const plan = currentPlan
      if (!plan) return
      const renderer: any = api?.renderer
      const editor = process.env.VISUAL || process.env.EDITOR

      if (!editor) {
        showToast({
          title: "EDITOR não definido",
          message: "Exporte $EDITOR (ex.: nvim) para editar planos no TUI.",
          variant: "warning",
          duration: 6000,
        })
        return
      }
      if (!renderer || typeof renderer.suspend !== "function") {
        await showAlert(`✏️ ${plan.title}`, `Editor externo indisponível nesta build.\n\n${plan.path}`)
        return
      }

      renderer.suspend()
      try {
        renderer.currentRenderBuffer?.clear?.()
        await runExternalEditor(editor, plan.path)
        reloadPlan()
        showToast({
          title: "Plano salvo",
          message: shortPath(plan.path),
          variant: "success",
          duration: 3000,
        })
      } catch (e) {
        showToast({
          title: "Editor encerrado com erro",
          message: String(e),
          variant: "error",
          duration: 6000,
        })
        reloadPlan()
      } finally {
        try {
          renderer.currentRenderBuffer?.clear?.()
          renderer.resume?.()
          renderer.requestRender?.()
        } catch {}
      }
    }

    const approvePlan = async () => {
      const plan = currentPlan
      if (!plan) return
      const ok = await confirmFrom(
        "✅ Aprovar e implementar",
        `${plan.title} (${plan.scopeLabel})\n\nStatus -> approved e início imediato da execução pelo agente.`,
        "Aprovar & Implementar"
      )
      if (!ok) return

      if (!setStatus("approved")) return

      const sent = await sendPrompt(
        [
          `PLAN APPROVED: ${plan.path} [${plan.scopeLabel}] (frontmatter status: approved).`,
          `Start implementation now.`,
          `- Follow the checklist top-down; keep \`status: in_progress\` while executing.`,
          `- Mark \`- [x]\` as each item completes and set \`status: completed\` at the end.`,
          `- Report per-STEP progress (PLAN / STEP trace / CHANGED / COMMANDS) in every update.`,
        ].join("\n")
      )

      showToast({
        title: sent ? "Plano aprovado" : "Plano aprovado (sem envio)",
        message: sent
          ? "Agente notificado — execução iniciada."
          : `Status gravado em ${shortPath(plan.path)}`,
        variant: sent ? "success" : "warning",
        duration: 5000,
      })
    }

    const finalizePlan = async () => {
      const plan = currentPlan
      if (!plan) return
      const ok = await confirmFrom(
        "🏁 Finalizar plano",
        `${plan.title}\n\nStatus -> completed e fechamento do painel.`,
        "Finalizar"
      )
      if (!ok) return

      if (!setStatus("completed")) return
      try {
        api?.ui?.panel?.close?.()
      } catch {}
      showToast({
        title: "Plano finalizado",
        message: `${plan.title} • ${progressOf(plan.content).done} itens concluídos`,
        variant: "success",
        duration: 5000,
      })
    }

    const rejectPlan = async () => {
      const plan = currentPlan
      if (!plan) return
      const ok = await confirmFrom(
        "❌ Negar plano",
        `${plan.title}\n\nStatus -> rejected. O painel será fechado.`,
        "Negar"
      )
      if (!ok) return

      const feedback = await promptFrom(
        "Feedback / ajustes necessários (opcional)",
        "Ex.: escopo pequeno, testes antes"
      )

      if (!setStatus("rejected")) return
      try {
        api?.ui?.panel?.close?.()
      } catch {}

      if (feedback && feedback.trim()) {
        await sendPrompt(
          [
            `PLAN REJECTED: ${plan.path} (frontmatter status: rejected).`,
            `Do not implement this version. Revise the plan with this feedback:`,
            feedback.trim(),
          ].join("\n")
        )
      }

      showToast({
        title: "Plano negado",
        message: feedback?.trim() ? "Feedback enviado ao agente." : shortPath(plan.path),
        variant: "warning",
        duration: 5000,
      })
    }

    // --- panel ----------------------------------------------------------

    const ensurePlan = (): boolean => {
      if (currentPlan && existsSync(currentPlan.path)) return true
      const plan = resolvePlan()
      if (!plan) {
        const pLabel = basename(cwd())
        showToast({
          title: "Sem Plano nesta Sessão",
          message: `Nenhum plano vinculado a esta sessão em [${activeScopeFilter === "project" ? pLabel : activeScopeFilter}]. Pressione [s] para vincular ou [n] para criar.`,
          variant: "warning",
          duration: 4000,
        })
        return false
      }
      currentPlan = plan
      bump()
      return true
    }

    let actionBusy = false
    const runOnce = (fn: (...args: any[]) => Promise<void>) => (...args: any[]) => {
      if (actionBusy) return
      actionBusy = true
      fn(...args)
        .catch((e) =>
          showToast({ title: "Ação falhou", message: String(e), variant: "error", duration: 6000 })
        )
        .finally(() => {
          actionBusy = false
        })
    }

    const doSelectPlan = runOnce(selectPlanDialog)
    const doCreatePlan = runOnce(createPlanDialog)
    const doEdit = runOnce(editPlan)
    const doApprove = runOnce(approvePlan)
    const doFinish = runOnce(finalizePlan)
    const doReject = runOnce(rejectPlan)
    const withPlan = (action: () => void) => () => {
      if (ensurePlan()) action()
    }

    const PlanPanel = (props: { panel: any }) => {
      const plan = () => {
        rev()
        return currentPlan
      }
      const body = () => plan()?.content ?? ""
      const status = () => plan()?.status ?? "draft"
      const meta = () => STATUS_META[status()] ?? { label: status().toUpperCase(), color: "#facc15", icon: "📝" }
      const metrics = () => progressOf(body())
      const sid = () => activeSession()

      const isSessionActive = () => {
        const p = plan()
        if (!p) return false
        const s = sid()
        if (!s) return false
        const sClean = s.trim().toLowerCase()
        if (p.sessionID && p.sessionID.trim().toLowerCase() === sClean) return true
        if (p.sessions?.some((sess) => sess.trim().toLowerCase() === sClean)) return true

        const curCwd = cwd()
        const discovered = discoverAllPlans(curCwd)
        for (const dir of [...discovered.projectDirs, ...discovered.globalDirs].map((d) => d.dir)) {
          const reg = loadSessionRegistry(dir)
          for (const k of Object.keys(reg)) {
            if (k.trim().toLowerCase() === sClean) {
              if (reg[k]?.activePlan === p.path || reg[k]?.plans?.includes(p.path)) return true
            }
          }
        }
        return false
      }

      const scopeBadge = () => {
        const p = plan()
        if (!p) return { label: "—", color: "#94a3b8" }
        const color = SCOPE_COLORS[p.scope] ?? "#38bdf8"
        const prefix = p.scope === "project" ? "📁 Projeto: " : p.scope === "global" ? "🌐 " : "📦 Workspace: "
        return { label: `${prefix}${p.scopeLabel}`, color }
      }

      const sessionLabel = () => {
        const s = sid()
        const p = plan()
        if (!p) return "—"
        if (s && (p.sessionID === s || p.sessions.includes(s) || isSessionActive())) {
          return `🔗 Sessão atual (${s.slice(0, 8)}...)`
        }
        if (p.sessionID) {
          return `🔗 Sessão ${p.sessionID.slice(0, 8)}...`
        }
        return `🌐 Não vinculado a sessão`
      }

      // If no plan is loaded in current scope:
      if (!plan()) {
        const pLabel = basename(cwd())
        const scopeTitle = activeScopeFilter === "project" ? `Projeto Atual (${pLabel})` : "Globais (~/.opencode)"

        const emptyActions: Action[] = [
          { key: "n", bind: "n", label: "[n] Criar Novo Plano", color: "#22c55e", run: () => doCreatePlan("project") },
          { key: "t", bind: "t", label: activeScopeFilter === "project" ? "[t] Alternar: Globais (~)" : "[t] Alternar: Projeto Atual", color: "#c084fc", run: toggleScope },
          { key: "s", bind: "s", label: "[s] Trocar/Lista", color: "#38bdf8", run: () => doSelectPlan() },
          { key: "esc", bind: "escape", label: "[esc] Fechar", color: "#64748b", run: () => api?.ui?.panel?.close?.() },
        ]

        api?.keymap?.layer?.(() => ({
          commands: emptyActions.map((a) => ({
            id: `plan.panel.${a.key === "esc" ? "close" : a.key}`,
            title: a.label.replace(/^\[|\]$/g, ""),
            group: "Plan",
            bind: a.bind,
            enabled: () => true,
            run: a.run,
          })),
        }))

        return (
          <box borderStyle="round" borderColor="#64748b" padding={1} flexDirection="column" flexGrow={1}>
            <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
              <text bold fg="#94a3b8">📋 PLANOS: {scopeTitle}</text>
              <text bold fg="#facc15">[SEM PLANO VINCULADO]</text>
            </box>
            <box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
              <text fg="#cbd5e1">Nenhum plano vinculado a esta sessão.</text>
              <text dimColor marginTop={1}>Pressione [n] para criar um novo plano para esta sessão ou [s] para vincular um existente.</text>
            </box>
            <box flexDirection="row" marginTop={1}>
              {emptyActions.map((a) => (
                <box backgroundColor="#1e293b" paddingLeft={1} paddingRight={1} marginRight={1} onClick={a.run}>
                  <text bold fg={a.color}>{a.label}</text>
                </box>
              ))}
            </box>
          </box>
        )
      }

      const actions: Action[] = [
        { key: "s", bind: "s", label: "[s] Trocar/Lista", color: "#38bdf8", run: () => doSelectPlan() },
        { key: "t", bind: "t", label: activeScopeFilter === "project" ? "[t] Escopo: Globais" : "[t] Escopo: Projeto", color: "#c084fc", run: toggleScope },
        { key: "e", bind: "e", label: "[e] Editar", color: "#facc15", run: doEdit },
        { key: "a", bind: "a", label: "[a] Aprovar & Iniciar", color: "#22c55e", run: doApprove },
        { key: "f", bind: "f", label: "[f] Finalizar", color: "#34d399", run: doFinish },
        { key: "n", bind: "n", label: "[n] Negar", color: "#f87171", run: doReject },
        { key: "r", bind: "r", label: "[r] Recarregar", color: "#94a3b8", run: reloadPlan },
        { key: "esc", bind: "escape", label: "[esc] Fechar", color: "#64748b", run: () => api?.ui?.panel?.close?.() },
      ]

      api?.keymap?.layer?.(() => ({
        commands: actions.map((a) => ({
          id: `plan.panel.${a.key === "esc" ? "close" : a.key}`,
          title: a.label.replace(/^\[|\]$/g, ""),
          group: "Plan",
          bind: a.bind,
          enabled: () => Boolean(currentPlan),
          run: a.run,
        })),
      }))

      return (
        <box borderStyle="round" borderColor={meta().color} padding={1} flexDirection="column" flexGrow={1}>
          {/* Header Row 1: Clean Human Title & Status Badge */}
          <box flexDirection="row" justifyContent="space-between" marginBottom={0}>
            <text bold fg="#38bdf8">
              📋 {plan()?.title ?? "—"}
            </text>
            <box flexDirection="row">
              <text bold fg={meta().color}>
                [{meta().label}]
              </text>
              {isSessionActive() ? <text bold fg="#22c55e"> [SESSÃO ATIVA]</text> : null}
            </box>
          </box>

          {/* Header Row 2: Scope, Session & Filename */}
          <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
            <box flexDirection="row">
              <text bold fg={scopeBadge().color}>
                {scopeBadge().label}
              </text>
              <text fg="#94a3b8"> • {sessionLabel()}</text>
              <text dimColor fg="#64748b"> • 📄 {plan()?.name}</text>
            </box>
            <text dimColor fg="#c084fc">
              [t] Alternar escopo
            </text>
          </box>

          {/* Header Row 3: Progress Bar & Metrics */}
          <text fg="#94a3b8">
            {metrics().total > 0
              ? `${progressBar(metrics().percent)} ${metrics().percent}% • ${metrics().done}/${metrics().total} itens concluídos • ${metrics().pending} pendentes`
              : "Sem itens de checklist"}
          </text>

          {/* Clean Markdown Body (Frontmatter stripped from scrollbox) */}
          <scrollbox flexGrow={1} marginTop={1}>
            <text>{stripFrontmatter(body())}</text>
          </scrollbox>

          {/* Action Buttons as Modern Pill Chips */}
          <box flexDirection="row" marginTop={1}>
            {actions.map((a) => (
              <box backgroundColor="#1e293b" paddingLeft={1} paddingRight={1} marginRight={1} onClick={a.run}>
                <text bold fg={a.color}>{a.label}</text>
              </box>
            ))}
          </box>

          {/* Footer Info */}
          <box marginTop={1} flexDirection="row" justifyContent="space-between">
            <text dimColor>
              {plan() ? shortPath(plan()!.path) : ""}
            </text>
            <text dimColor>
              [t] alterna escopo • [s] lista planos • [e] editar
            </text>
          </box>
        </box>
      )
    }

    const showPlanFallback = async (plan: Plan | null) => {
      if (!plan) {
        const pLabel = basename(cwd())
        showToast({
          title: `Sem planos nesta sessão [${pLabel}]`,
          message: "Pressione /plan new para criar ou /plan list para vincular um plano",
          variant: "warning",
          duration: 5000,
        })
        return
      }
      const message = `Arquivo: ${shortPath(plan.path)}\nEscopo: [${plan.scopeLabel}]\nStatus: [${(STATUS_META[plan.status]?.label ?? plan.status).toUpperCase()}]\nAções: /plan [s] trocar · [t] escopo · [e] editar · [a] aprovar · [f] finalizar · [n] negar\n\n${stripFrontmatter(plan.content).slice(0, 4000)}`
      try {
        if (api?.ui?.dialog?.alert) {
          await api.ui.dialog.alert({ title: `📋 ${plan.title}`, message })
          return
        }
      } catch {}
      showToast({
        title: `📋 ${plan.title} [${plan.status}]`,
        message: `${shortPath(plan.path)} (${plan.scopeLabel})`,
        variant: "info",
        duration: 6000,
      })
    }

    const togglePanel = async (selector?: string) => {
      const raw = (selector ?? "").trim()
      const parts = raw.split(/\s+/)
      const sub = parts[0]?.toLowerCase()

      if (sub === "list" || sub === "select" || sub === "trocar" || sub === "lista") {
        const scopeParam = parts[1]?.toLowerCase()
        await selectPlanDialog(scopeParam)
        return
      }

      if (sub === "new" || sub === "novo") {
        const scopeParam = (parts[1]?.toLowerCase() === "global" ? "global" : "project") as "project" | "global"
        await createPlanDialog(scopeParam)
        return
      }

      // Toggle: close if our panel is currently open and no selector was passed
      try {
        const active = api?.ui?.panel?.current?.()
        if (active?.name === PANEL_NAME && !raw) {
          api.ui.panel.close()
          return
        }
      } catch {}

      const plan = resolvePlan(raw)

      currentPlan = plan

      let opened = false
      try {
        opened = Boolean(api?.ui?.panel?.open?.(PANEL_NAME))
      } catch {}

      if (!opened) {
        await showPlanFallback(plan)
        return
      }

      bump()
      if (plan) {
        const meta = STATUS_META[plan.status] ?? { label: plan.status.toUpperCase() }
        showToast({
          title: `Plano: ${plan.title}`,
          message: `[${meta.label}] • [${plan.scopeLabel}] • [s] trocar  [t] escopo  [e] editar  [a] aprovar`,
          variant: "info",
          duration: 4000,
        })
      } else {
        const pLabel = basename(cwd())
        showToast({
          title: `Sessão sem plano vinculado`,
          message: `Pressione [n] para criar ou [s] para vincular um plano (${pLabel})`,
          variant: "info",
          duration: 4000,
        })
      }
    }

    // 1. Persistent contribution to the session panel slot.
    let offSession: (() => void) | undefined
    try {
      offSession = api?.ui?.slot?.({
        append: "session.panel",
        render: (panel: any) => {
          if (panel?.sessionID) panelSessionID = panel.sessionID
          if (panel?.name !== PANEL_NAME) return null
          if (!currentPlan) {
            currentPlan = resolvePlan()
          }
          return <PlanPanel panel={panel} />
        },
      })
    } catch (e) {
      showToast({
        title: "opencode.plan-panel",
        message: `Falha ao registrar o painel de plano: ${String(e)}`,
        variant: "warning",
        duration: 8000,
      })
    }

    // 2. Banner on top of prompt composer (`session.composer.top`) - STRICTLY FOR CURRENT SESSION PLANS
    let offComposerTop: (() => void) | undefined
    try {
      offComposerTop = api?.ui?.slot?.({
        append: "session.composer.top",
        render: (ctx: any) => {
          rev()
          const curCwd = cwd()
          if (ctx?.sessionID) panelSessionID = ctx.sessionID
          const sid = ctx?.sessionID || activeSession()
          if (!sid) return null

          const effectiveScope = isHome() ? "global" : activeScopeFilter
          const { sessionActivePlan } = getSessionScopedPlans(curCwd, sid, effectiveScope)
          if (!sessionActivePlan) return null

          if (sessionActivePlan.status === "draft") {
            return (
              <box
                flexDirection="row"
                justifyContent="space-between"
                paddingLeft={1}
                paddingRight={1}
                borderStyle="round"
                borderColor="#facc15"
                backgroundColor="#291e03"
                marginBottom={0}
                onClick={() => togglePanel()}
              >
                <box flexDirection="row">
                  <text bold fg="#facc15">
                    📋 PLANO:{" "}
                  </text>
                  <text bold fg="#fef08a">
                    {truncateEnd(sessionActivePlan.title, 42)}{" "}
                  </text>
                  <text fg="#fde047">[{sessionActivePlan.scopeLabel}]</text>
                  <text bold fg="#facc15"> • [AGUARDANDO REVIEW]</text>
                </box>
                <box flexDirection="row">
                  <text fg="#facc15">Pressione </text>
                  <text bold fg="#38bdf8">
                    Ctrl+G
                  </text>
                  <text fg="#facc15"> para Aprovar / Ver Plano</text>
                </box>
              </box>
            )
          }

          if (sessionActivePlan.status === "approved" || sessionActivePlan.status === "in_progress") {
            return (
              <box
                flexDirection="row"
                justifyContent="space-between"
                paddingLeft={1}
                paddingRight={1}
                borderStyle="round"
                borderColor="#38bdf8"
                backgroundColor="#0c1d33"
                marginBottom={0}
                onClick={() => togglePanel()}
              >
                <box flexDirection="row">
                  <text bold fg="#38bdf8">
                    ⏳ PLANO:{" "}
                  </text>
                  <text fg="#e2e8f0">{truncateEnd(sessionActivePlan.title, 42)} </text>
                  <text bold fg="#38bdf8">
                    ({sessionActivePlan.progress.percent}%)
                  </text>
                  <text fg="#94a3b8">
                    {" "}• {sessionActivePlan.progress.done}/{sessionActivePlan.progress.total} itens
                  </text>
                </box>
                <text dimColor fg="#38bdf8">
                  Ctrl+G /plan
                </text>
              </box>
            )
          }

          return null
        },
      })
    } catch (e) {
      // session.composer.top slot optional
    }

    // 3. Status indicator in prompt footer (`prompt.footer.status`) - STRICTLY FOR CURRENT SESSION PLANS
    let offFooterStatus: (() => void) | undefined
    try {
      offFooterStatus = api?.ui?.slot?.({
        append: "prompt.footer.status",
        render: () => {
          rev()
          const curCwd = cwd()
          const sid = activeSession()
          if (!sid) return null

          const effectiveScope = isHome() ? "global" : activeScopeFilter
          const { sessionActivePlan } = getSessionScopedPlans(curCwd, sid, effectiveScope)
          if (!sessionActivePlan) return null

          if (sessionActivePlan.status === "draft") {
            return (
              <box onClick={() => togglePanel()}>
                <text fg="#facc15" bold>
                  📋 Plano: {truncateEnd(sessionActivePlan.title, 24)} [Review] (Ctrl+G)
                </text>
              </box>
            )
          }
          if (sessionActivePlan.status === "approved" || sessionActivePlan.status === "in_progress") {
            return (
              <box onClick={() => togglePanel()}>
                <text fg="#38bdf8">
                  ⏳ Plano: {sessionActivePlan.progress.percent}% (Ctrl+G)
                </text>
              </box>
            )
          }
          return null
        },
      })
    } catch (e) {
      // prompt.footer.status optional
    }

    // 4. Slash commands + palette entries
    let offApp: (() => void) | undefined
    let layerOn = false
    try {
      offApp = api?.ui?.slot?.({
        append: "app",
        render: () => {
          if (layerOn) return null
          layerOn = true
          api.keymap.layer(() => ({
            mode: "global",
            priority: 60,
            commands: [
              {
                id: "plan.toggle",
                title: "Visualizar / Alternar Plano Ativo (Plan Viewer)",
                group: "Plan",
                palette: true,
                suggested: true,
                enabled: () => true,
                bind: "ctrl+g",
                slash: {
                  name: "plan",
                  arguments: true,
                },
                run: (input?: string) => {
                  togglePanel(input)
                },
              },
              {
                id: "plan.select",
                title: "Listar & Trocar Plano / Escopo (Plan Switcher & Scopes)",
                group: "Plan",
                palette: true,
                suggested: true,
                enabled: () => true,
                run: () => doSelectPlan(),
              },
              {
                id: "plan.new",
                title: "Criar Novo Plano (Projeto / Global)",
                group: "Plan",
                palette: true,
                enabled: () => true,
                run: () => doCreatePlan(),
              },
              {
                id: "plan.edit",
                title: "Editar plano ativo",
                group: "Plan",
                palette: true,
                enabled: () => true,
                run: withPlan(doEdit),
              },
              {
                id: "plan.approve",
                title: "Aprovar plano e implementar",
                group: "Plan",
                palette: true,
                suggested: true,
                enabled: () => true,
                run: withPlan(doApprove),
              },
              {
                id: "plan.finish",
                title: "Finalizar plano (completed)",
                group: "Plan",
                palette: true,
                suggested: true,
                enabled: () => true,
                run: withPlan(doFinish),
              },
              {
                id: "plan.reject",
                title: "Negar plano",
                group: "Plan",
                palette: true,
                enabled: () => true,
                run: withPlan(doReject),
              },
            ],
            bindings: [
              "plan.toggle",
              "plan.select",
              "plan.new",
              "plan.edit",
              "plan.approve",
              "plan.reject",
              "plan.finish",
            ],
          }))
          return null
        },
      })
    } catch (e) {
      showToast({
        title: "opencode.plan-panel",
        message: `Falha ao registrar /plan: ${String(e)}`,
        variant: "warning",
        duration: 8000,
      })
    }

    // 5. Live refresh: check for on-disk changes
    const refreshTimer = setInterval(() => {
      try {
        if (!currentPlan || actionBusy) return
        if (api?.ui?.panel?.current?.()?.name !== PANEL_NAME) return
        const fresh = readPlan(currentPlan.path, currentPlan.scope, currentPlan.scopeLabel)
        if (fresh && (fresh.content !== currentPlan.content || fresh.status !== currentPlan.status)) {
          currentPlan = fresh
          bump()
        }
      } catch {}
    }, 2000)

    return () => {
      clearInterval(refreshTimer)
      offSession?.()
      offComposerTop?.()
      offFooterStatus?.()
      offApp?.()
    }
  },
}

function runExternalEditor(editor: string, file: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const [cmd, ...args] = editor.trim().split(/\s+/)
    if (!cmd) {
      reject(new Error("editor vazio"))
      return
    }
    let child
    try {
      child = spawn(cmd, [...args, file], { stdio: "inherit", shell: false })
    } catch (e) {
      reject(e)
      return
    }
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`editor saiu com ${signal ? `signal ${signal}` : `code ${code}`}`))
    })
  })
}
