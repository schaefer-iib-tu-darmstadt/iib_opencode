# Developer workflow

For working on iibcode itself (editing source, debugging tool dispatch, adjusting providers). For just *using* iibcode, the [README quickstart](../README.md) is enough.

## Run from source (no build step)

Useful while iterating on fork-internal changes:

```powershell
bun dev                                                                       # interactive TUI from source
bun dev models gwdg                                                           # list configured models
bun dev run --dir . "Reply with PONG" -m gwdg/qwen3-coder-30b-a3b-instruct    # one-shot
```

`bun dev` inherits a `--cwd packages/opencode` (see [troubleshooting.md](troubleshooting.md#bun-dev-thinks-the-project-root-is-packagesopencode)), so it's only good for testing fork edits — pass `--dir <path>` to `run` to override. For daily coding work in real projects, use the built binary instead.

## Rebuild after editing the fork

| What you changed | Rebuild needed? |
|---|---|
| `opencode.json` (model list, providers, limits) | **No** — read at runtime. Edit the global copy in `~/.config/opencode/` for an instant effect. |
| `scripts/*` | No — dev-time scripts, not bundled. |
| `packages/opencode/src/**` | **Yes** — re-run the build below. |
| Iterating fast? | Use `bun dev` until happy, then build once. |

Rebuild from the **repo root**:

```powershell
bun run iibcode:build
Copy-Item dist\iibcode.exe "$env:USERPROFILE\.bun\bin\iibcode.exe" -Force
iibcode --version
```

`bun run iibcode:build` MUST run from the repo root, not from `packages/opencode/`. The script handles `cd`'ing internally and renames the binary to `iibcode`. Running `bun run build` from inside `packages/opencode/` instead produces an `opencode.exe` that doesn't update anything on PATH.

After every build, `bun.lock` and `packages/opencode/package.json` get dirtied with line-ending changes on Windows. Don't commit those — `git checkout -- bun.lock packages/opencode/package.json` resets them.

## Re-probe the GWDG model catalog

Run the **`/models-refresh`** command inside the TUI. It fetches the current GWDG
`/v1/models` catalog, probes tool-call support for any new models, scrapes each
model's context window from the [GWDG docs](https://docs.hpc.gwdg.de/services/ai-services/chat-ai/models/index.html),
and writes all of it back into `opencode.json` (existing hand-tuned `output`
limits and `tool_call` flags are preserved). Run it when GWDG enables tool
calling on more deployments or adds new models. See [models.md](models.md) for
the current snapshot. Implementation: `packages/opencode/src/cli/cmd/tui/util/gwdg-refresh.ts`.

## What's customized in this fork

See **[fork-changes.md](fork-changes.md)** — the canonical, per-file list of everything that deviates from upstream. Short version: the `gwdg` provider is pure config (`opencode.json`), the fork features (rate-limit sidebar, `/models-refresh`, branding) live in fork-owned files, and a handful of upstream files carry small commented hook blocks to wire them up.

The original upstream OpenCode README (English + 21 translations) lives in [`upstream-readme/`](upstream-readme/).

For the upstream sync flow itself, see [maintainer-sync.md](maintainer-sync.md).
