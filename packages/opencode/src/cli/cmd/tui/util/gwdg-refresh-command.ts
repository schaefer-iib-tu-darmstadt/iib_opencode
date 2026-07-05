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

    // The fetch/probe/diff/prune/write logic lives in the shared core so the TUI
    // command and headless setup stay in lock-step. Here we only supply the TUI
    // shell: toast progress, a confirm dialog before probing, and a SIGUSR2 reload.
    const result = await GwdgRefresh.syncCatalogToConfigs({
      apiKey,
      configPaths: targets.paths,
      onProgress: (message) => toast.show({ variant: "info", message }),
      // Only gate on a dialog when there's probing to authorize (it costs time). Pure
      // removals / limit refreshes proceed silently — pruning is a kommentarlos sync.
      confirmProbe: async ({ newIds, staleIds, paths }) => {
        const lines = [`Found ${newIds.length} new model(s):`, ...newIds.map((id) => `  + ${id}`)]
        if (staleIds.length > 0) {
          lines.push("", `${staleIds.length} model(s) no longer on GWDG (will be removed):`)
          lines.push(...staleIds.map((id) => `  - ${id}`))
        }
        lines.push("", `Syncing ${paths.length} config(s): ${paths.join(", ")}`)
        lines.push(
          "",
          `Probe each new model for tool-call support? (~${Math.ceil((newIds.length * GwdgRefresh.constants.PROBE_GAP_MS) / 1000)}s)`,
        )
        // DialogConfirm.show resolves boolean | undefined; treat anything but an
        // explicit true (dismiss / escape) as "don't probe".
        return (await DialogConfirm.show(dialog, "Refresh GWDG models", lines.join("\n"))) === true
      },
    })

    if (result.cancelled) return

    // The TUI parent process registers a SIGUSR2 handler in thread.ts that
    // invalidates the worker's config cache and triggers a TUI re-bootstrap.
    // process.emit fires the same handler cross-platform; process.kill may
    // be a no-op on Windows because Bun does not deliver POSIX signals there.
    let reloadAttempted = false
    if (result.wroteAny) {
      try {
        ;(process as unknown as { emit: (name: string, value: string) => void }).emit("SIGUSR2", "SIGUSR2")
        reloadAttempted = true
      } catch {}
    }

    const configCount = targets.paths.length
    if (!result.wroteAny) {
      const staleNote = result.protectedStale.length > 0 ? ` (${result.protectedStale.length} stale default kept)` : ""
      toast.show({
        variant: "success",
        message: `All ${result.readyCount} GWDG models match ${configCount} config(s)${staleNote}`,
      })
      return
    }

    const parts: string[] = [`Added ${result.added.length}`]
    if (result.removed.length > 0) parts.push(`removed ${result.removed.length}`)
    if (result.limitUpdated.length > 0) parts.push(`updated ${result.limitUpdated.length} context limit(s)`)
    // No-tool models are probed but filtered out, so probed != added — report both.
    if (result.skipped > 0) parts.push(`skipped ${result.skipped} without tool calling`)
    if (result.protectedStale.length > 0) parts.push(`kept ${result.protectedStale.length} stale default(s)`)
    const summary = `${parts.join(", ")} across ${configCount} config(s)`
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
