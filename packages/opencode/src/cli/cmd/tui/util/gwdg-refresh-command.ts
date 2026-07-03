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

async function run({ dialog, toast, project }: Deps): Promise<void> {
  try {
    const apiKey = GwdgRefresh.getApiKey()

    const projectDir = project.data.instance.path.directory || process.cwd()
    // Prefer a project-local opencode.json; fall back to the global user config
    // (~/.config/opencode) so /models-refresh also works from outside the repo.
    const target = await GwdgRefresh.resolveConfigPath(projectDir)
    if (target.path === null) {
      toast.show({
        variant: "error",
        message: `opencode.json not found (project: ${target.projectDir}, global: ${target.globalPath})`,
      })
      return
    }
    const configPath = target.path

    toast.show({ variant: "info", message: "Fetching GWDG model catalog..." })
    const catalog = await GwdgRefresh.fetchCatalog(apiKey)
    // Best-effort scrape of per-model context windows (API omits them); [] on failure.
    const limits = await GwdgRefresh.fetchContextLimits()
    const config = await GwdgRefresh.readConfig(configPath)
    const providers = (config.provider as Record<string, { models?: Record<string, unknown> }> | undefined) ?? {}
    const existing = providers.gwdg?.models ?? {}
    const diff = GwdgRefresh.diffCatalog(existing, catalog)

    if (diff.newIds.length === 0) {
      // No new models, but refresh context limits on the existing ones.
      const { updated } = GwdgRefresh.applyContextLimits(
        existing as Record<string, { limit?: { context?: number; output?: number } }>,
        catalog,
        limits,
      )
      if (updated.length > 0) {
        await GwdgRefresh.writeConfig(configPath, config)
        try {
          ;(process as unknown as { emit: (name: string, value: string) => void }).emit("SIGUSR2", "SIGUSR2")
        } catch {}
      }
      const staleNote = diff.staleIds.length > 0 ? ` (${diff.staleIds.length} stale in config)` : ""
      const limitNote = updated.length > 0 ? `, updated ${updated.length} context limit(s)` : ""
      toast.show({
        variant: "success",
        message: `All ${diff.readyCount} GWDG models match opencode.json${staleNote}${limitNote}`,
      })
      return
    }

    const lines = [`Found ${diff.newIds.length} new model(s):`, ...diff.newIds.map((id) => `  + ${id}`)]
    if (diff.staleIds.length > 0) {
      lines.push("", `${diff.staleIds.length} model(s) in config but not on GWDG (kept):`)
      lines.push(...diff.staleIds.map((id) => `  ~ ${id}`))
    }
    lines.push(
      "",
      `Probe each new model for tool-call support? (~${Math.ceil((diff.newIds.length * GwdgRefresh.constants.PROBE_GAP_MS) / 1000)}s)`,
    )

    const ok = await DialogConfirm.show(dialog, "Refresh GWDG models", lines.join("\n"))
    if (!ok) return

    const newEntries: Record<string, GwdgRefresh.ConfigModelEntry> = {}
    for (let i = 0; i < diff.newIds.length; i++) {
      const id = diff.newIds[i]
      toast.show({ variant: "info", message: `Probing ${i + 1}/${diff.newIds.length}: ${id}` })
      const model = catalog.data.find((m) => m.id === id)
      if (!model) continue
      const probe = await GwdgRefresh.probeToolCall(id, apiKey)
      const { entry } = GwdgRefresh.buildEntry(model, probe, limits)
      newEntries[id] = entry
      if (i < diff.newIds.length - 1) await GwdgRefresh.sleep(GwdgRefresh.constants.PROBE_GAP_MS)
    }

    const provider = (config.provider ??= {} as Record<string, unknown>) as Record<
      string,
      { models?: Record<string, unknown> }
    >
    const gwdg = (provider.gwdg ??= {})
    gwdg.models = { ...(gwdg.models ?? {}), ...newEntries }
    // Also refresh context limits on models that were already in the config.
    const limitUpdate = GwdgRefresh.applyContextLimits(
      gwdg.models as Record<string, { limit?: { context?: number; output?: number } }>,
      catalog,
      limits,
    )
    await GwdgRefresh.writeConfig(configPath, config)

    // The TUI parent process registers a SIGUSR2 handler in thread.ts that
    // invalidates the worker's config cache and triggers a TUI re-bootstrap.
    // process.emit fires the same handler cross-platform; process.kill may
    // be a no-op on Windows because Bun does not deliver POSIX signals there.
    let reloadAttempted = false
    try {
      ;(process as unknown as { emit: (name: string, value: string) => void }).emit("SIGUSR2", "SIGUSR2")
      reloadAttempted = true
    } catch {}

    const limitNote = limitUpdate.updated.length > 0 ? `, updated ${limitUpdate.updated.length} context limit(s)` : ""
    toast.show({
      variant: "success",
      message: reloadAttempted
        ? `Added ${diff.newIds.length} model(s)${limitNote} — open /models to see them`
        : `Added ${diff.newIds.length} model(s)${limitNote} — restart TUI to use them`,
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
