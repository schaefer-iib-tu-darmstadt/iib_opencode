// iibcode fork: the /models-refresh TUI command. The full handler lives here
// so app.tsx only needs a one-line entry in its command list — keeping the
// upstream-file diff (and therefore the merge-conflict surface) minimal.
// The underlying fetch/probe/scrape logic is in ./gwdg-refresh.
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import type { DialogContext } from "@tui/ui/dialog"
import type { useToast } from "@tui/ui/toast"
import type { useProject } from "@tui/context/project"
import type { CommandOption } from "@tui/component/dialog-command"
import * as GwdgRefresh from "@tui/util/gwdg-refresh"

type Deps = {
  dialog: DialogContext
  toast: ReturnType<typeof useToast>
  project: ReturnType<typeof useProject>
}

export function command(deps: Deps): CommandOption {
  return {
    title: "Refresh GWDG models",
    value: "model.refresh_gwdg",
    category: "Agent",
    slash: {
      name: "models-refresh",
    },
    onSelect: () => void run(deps),
  }
}

// One opencode.json we're about to sync, with its diff against the live catalog.
type TargetState = {
  path: string
  config: Record<string, unknown>
  models: Record<string, unknown>
  newIds: string[]
  staleIds: string[]
  defaultModel?: string
}

// The top-level `model` key is stored as "provider/model-id"; the models map is
// keyed by bare model id. Strip the provider prefix so we can protect the active
// default from being pruned.
function defaultModelId(config: Record<string, unknown>): string | undefined {
  const m = config.model
  if (typeof m !== "string") return undefined
  return m.includes("/") ? m.slice(m.lastIndexOf("/") + 1) : m
}

async function run({ dialog, toast, project }: Deps): Promise<void> {
  try {
    const apiKey = GwdgRefresh.getApiKey()

    const projectDir = project.data.instance.path.directory || process.cwd()
    // /models-refresh is a plain "mirror the current GWDG catalog" action, so sync
    // BOTH the nearest project-local opencode.json AND the global user config
    // (~/.config/opencode) when both exist — not just whichever is in effect.
    const targets = await GwdgRefresh.resolveConfigTargets(projectDir)
    if (targets.paths.length === 0) {
      toast.show({
        variant: "error",
        message: `opencode.json not found (project: ${targets.projectDir}, global: ${targets.globalPath})`,
      })
      return
    }

    toast.show({ variant: "info", message: "Fetching GWDG model catalog..." })
    const catalog = await GwdgRefresh.fetchCatalog(apiKey)
    // Best-effort scrape of per-model context windows (API omits them); [] on failure.
    const limits = await GwdgRefresh.fetchContextLimits()

    // Load every target config and diff each against the live catalog.
    const states: TargetState[] = []
    let readyCount = 0
    for (const configPath of targets.paths) {
      const config = await GwdgRefresh.readConfig(configPath)
      const provider = (config.provider ??= {} as Record<string, unknown>) as Record<
        string,
        { models?: Record<string, unknown> }
      >
      const gwdg = (provider.gwdg ??= {})
      const models = (gwdg.models ??= {}) as Record<string, unknown>
      const diff = GwdgRefresh.diffCatalog(models, catalog)
      readyCount = diff.readyCount
      states.push({
        path: configPath,
        config,
        models,
        newIds: diff.newIds,
        staleIds: diff.staleIds,
        defaultModel: defaultModelId(config),
      })
    }

    // Probe each new model at most once, even if it's new to several configs.
    const newIdsUnion = [...new Set(states.flatMap((s) => s.newIds))].sort()
    const staleUnion = [...new Set(states.flatMap((s) => s.staleIds))].sort()

    // Only gate on a dialog when there's probing to authorize (it costs time). Pure
    // removals / limit refreshes proceed silently — pruning is a kommentarlos sync.
    if (newIdsUnion.length > 0) {
      const lines = [
        `Found ${newIdsUnion.length} new model(s):`,
        ...newIdsUnion.map((id) => `  + ${id}`),
      ]
      if (staleUnion.length > 0) {
        lines.push("", `${staleUnion.length} model(s) no longer on GWDG (will be removed):`)
        lines.push(...staleUnion.map((id) => `  - ${id}`))
      }
      lines.push("", `Syncing ${states.length} config(s): ${states.map((s) => s.path).join(", ")}`)
      lines.push(
        "",
        `Probe each new model for tool-call support? (~${Math.ceil((newIdsUnion.length * GwdgRefresh.constants.PROBE_GAP_MS) / 1000)}s)`,
      )
      const ok = await DialogConfirm.show(dialog, "Refresh GWDG models", lines.join("\n"))
      if (!ok) return
    }

    const newEntries: Record<string, GwdgRefresh.ConfigModelEntry> = {}
    for (let i = 0; i < newIdsUnion.length; i++) {
      const id = newIdsUnion[i]
      toast.show({ variant: "info", message: `Probing ${i + 1}/${newIdsUnion.length}: ${id}` })
      const model = catalog.data.find((m) => m.id === id)
      if (!model) continue
      const probe = await GwdgRefresh.probeToolCall(id, apiKey)
      const { entry } = GwdgRefresh.buildEntry(model, probe, limits)
      // iibcode: only keep tool-capable models. Models without tool calling can't
      // drive the agentic loop (read/edit/bash), so they'd only clutter /models.
      // Vision stays covered by gemma-4-31b-it, which has tools + attachment.
      if (entry.tool_call) newEntries[id] = entry
      if (i < newIdsUnion.length - 1) await GwdgRefresh.sleep(GwdgRefresh.constants.PROBE_GAP_MS)
    }

    // Apply to every target: add its new tool-capable models, refresh context
    // limits, prune models GWDG dropped. Only rewrite a config that actually
    // changed (writeConfig reserializes the whole file, so skip no-ops).
    const addedSet = new Set<string>()
    const removedSet = new Set<string>()
    const protectedSet = new Set<string>()
    const limitSet = new Set<string>()
    let wroteAny = false
    for (const s of states) {
      let addedHere = 0
      for (const id of s.newIds) {
        if (newEntries[id]) {
          s.models[id] = newEntries[id]
          addedSet.add(id)
          addedHere++
        }
      }
      const limitUpdate = GwdgRefresh.applyContextLimits(
        s.models as Record<string, { limit?: { context?: number; output?: number } }>,
        catalog,
        limits,
      )
      limitUpdate.updated.forEach((id) => limitSet.add(id))
      const prune = GwdgRefresh.pruneStale(s.models, s.staleIds, s.defaultModel)
      prune.removed.forEach((id) => removedSet.add(id))
      prune.protectedStale.forEach((id) => protectedSet.add(id))

      if (addedHere > 0 || limitUpdate.updated.length > 0 || prune.removed.length > 0) {
        await GwdgRefresh.writeConfig(s.path, s.config)
        wroteAny = true
      }
    }

    // The TUI parent process registers a SIGUSR2 handler in thread.ts that
    // invalidates the worker's config cache and triggers a TUI re-bootstrap.
    // process.emit fires the same handler cross-platform; process.kill may
    // be a no-op on Windows because Bun does not deliver POSIX signals there.
    let reloadAttempted = false
    if (wroteAny) {
      try {
        ;(process as unknown as { emit: (name: string, value: string) => void }).emit("SIGUSR2", "SIGUSR2")
        reloadAttempted = true
      } catch {}
    }

    const addedCount = addedSet.size
    const removedCount = removedSet.size
    const limitCount = limitSet.size
    // No-tool models are probed but filtered out, so probed != added — report both.
    const skippedCount = newIdsUnion.length - addedCount

    if (!wroteAny) {
      const staleNote = protectedSet.size > 0 ? ` (${protectedSet.size} stale default kept)` : ""
      toast.show({
        variant: "success",
        message: `All ${readyCount} GWDG models match ${states.length} config(s)${staleNote}`,
      })
      return
    }

    const parts: string[] = [`Added ${addedCount}`]
    if (removedCount > 0) parts.push(`removed ${removedCount}`)
    if (limitCount > 0) parts.push(`updated ${limitCount} context limit(s)`)
    if (skippedCount > 0) parts.push(`skipped ${skippedCount} without tool calling`)
    if (protectedSet.size > 0) parts.push(`kept ${protectedSet.size} stale default(s)`)
    const summary = `${parts.join(", ")} across ${states.length} config(s)`
    toast.show({
      variant: "success",
      message: reloadAttempted ? `${summary} — open /models to see them` : `${summary} — restart TUI to use them`,
    })
  } catch (e) {
    if (e instanceof GwdgRefresh.GwdgRefreshError) {
      toast.show({
        variant: "error",
        title: e.message,
        message: e.hint ?? "",
      })
      return
    }
    toast.error(e)
  }
}
