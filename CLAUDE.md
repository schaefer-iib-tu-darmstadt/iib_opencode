# Claude Code context for this repo

You are working in a **personal fork of [anomalyco/opencode](https://github.com/anomalyco/opencode)** that's customized to talk to GWDG ChatAI and TUDaGPT (university LLM gateways serving open-weight models). The customized CLI is branded `iibcode`. See `README.md` for user-facing docs (the original upstream English README and 21 translations live in `docs/upstream-readme/`).

## What this repo is

- A clone of `anomalyco/opencode` (a TypeScript/Bun coding-agent CLI/TUI), with a project-local `opencode.json` adding `@ai-sdk/openai-compatible` providers for **GWDG** (and eventually TUDaGPT).
- Default branch: **`dev`** (upstream's default — not `main`).
- Two git remotes:
  - `upstream` → `https://github.com/anomalyco/opencode.git` (anomalyco, read-only for us)
  - `origin` → `https://github.com/schaefer-iib-tu-darmstadt/iibcode.git` (user's fork)

## Golden rules when working here

1. **Don't modify upstream files unless absolutely necessary.** Every file we edit becomes a merge conflict on `git pull upstream`. Prefer config-only changes via `opencode.json`. If you must touch source, do it in a clearly-named branch and document why.
2. **Never push to `upstream`.** That's `anomalyco/opencode`. Pushes go to `origin` (the user's fork) only.
3. **Never commit secrets.** `GWDG_API_KEY` lives in the User-scope env var on Windows, referenced as `{env:GWDG_API_KEY}` in `opencode.json`. Don't inline it.
4. **Don't run `bun install` without `--ignore-scripts` on Windows** unless Visual Studio C++ Build Tools are installed (see "Known issues" in `README.md`). It will fail building `tree-sitter-powershell`.

## Key paths

| Path | What |
|---|---|
| `opencode.json` | Project-local config. **Owned by us.** Defines `provider.gwdg` and the model list. |
| `README.md` | **Owned by us.** The iibcode quickstart (was `IIBCODE_QUICKSTART.md` before the rename). Marked `merge=ours` in `.gitattributes`. |
| `docs/upstream-readme/` | **Owned by us.** Holds the original upstream English `README.md` + 21 translations, moved here so iibcode owns the root README. Also `merge=ours`. |
| `.gitattributes` | **Owned by us.** Marks the two paths above as `merge=ours` so upstream merges auto-keep our version. |
| `packages/opencode/src/provider/` | Provider plumbing (read-only for us; understanding only). |
| `packages/opencode/src/session/` | Message loop and tool-call dispatch. The place to patch if open-weight models start emitting malformed tool calls (so far Qwen3-Coder is fine). |
| `packages/opencode/src/tool/` | Built-in tool definitions (glob, grep, read, write, edit, bash, etc.). |
| `packages/opencode/src/cli/cmd/run.ts` | The `opencode run` non-interactive entrypoint — accepts `--dir <path>` to set project root. |
| `packages/opencode/src/auth/index.ts` | Where `auth.json` (per-provider API keys, mode 0600) is read/written. |
| `packages/opencode/src/config/variable.ts` | Implements `{env:VAR}` and `{file:path}` substitution in `opencode.json`. |

## Environment

- **Platform:** Windows 10/11. Bun runs natively. Bash is Git Bash.
- **API key:** `GWDG_API_KEY` — User-scope env var. Set once with `[Environment]::SetEnvironmentVariable("GWDG_API_KEY", "...", "User")`. After setting, **new** shells inherit it; existing ones (including a running Claude Code instance) do not — restart Claude Code if its bash tool can't see it.
- **Bun:** `C:\Users\Nils\.bun\bin\bun.exe` on PATH.
- **Endpoints:**
  - GWDG: `https://chat-ai.academiccloud.de/v1` — OpenAI-compatible, `Authorization: Bearer $GWDG_API_KEY`. Note: `/v1/models` is a standard **GET** (the OpenAI `/v1/models` endpoint).
  - TUDaGPT: TU-network only, base URL TBD (ask HRZ).

## Common commands

```bash
# List configured models for the gwdg provider (config sanity check)
bun dev models gwdg

# One-shot run from any directory — IMPORTANT: use --dir, see "Gotcha" below
bun dev run --dir . "your prompt" -m gwdg/qwen3-coder-30b-a3b-instruct

# Interactive TUI (rooted in packages/opencode due to --cwd in dev script — gotcha below)
bun dev

# Pull upstream changes
git fetch upstream && git merge upstream/dev

# Test GWDG endpoint directly (PowerShell)
$h = @{ Authorization = "Bearer $env:GWDG_API_KEY"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "https://chat-ai.academiccloud.de/v1/models" -Method Get -Headers $h

# Re-probe the model list and tool-call support
bun run gwdg:refresh
```

## Known gotchas

1. **`bun dev` forces cwd to `packages/opencode`** because the root `dev` script does `bun run --cwd packages/opencode src/index.ts`. This means OpenCode treats that subdirectory as the project root. For one-shot `run`, override with `--dir <path>`. For TUI usage, build a binary (`cd packages/opencode && bun run build`) and run that from your actual project directory.
2. **Models can hallucinate counts** even when tools return correct results (Qwen3-Coder reported "31" matches when glob said 41). For numeric aggregations, prefer to surface the tool's reported count rather than ask the model to count from a list.
3. **`bun install` needs `--ignore-scripts`** on this Windows setup (no VS C++ tooling). Already noted, just don't forget on a fresh clone.
4. **`merge=ours` driver needs one-time per-clone setup.** `.gitattributes` marks `README.md` and `docs/upstream-readme/**` as `merge=ours` so `git merge upstream/dev` auto-keeps our version on those paths. The driver itself is not committed; on every fresh clone run once: `git config merge.ours.driver true`. Without it, you'll get normal merge conflicts on the README during upstream syncs (resolution is still trivial: `git checkout --ours README.md docs/upstream-readme/`).
5. **Upstream sometimes adds a new translation** (e.g. `README.cs.md`). After `git merge upstream/dev`, it'll appear at the repo root. Move it: `git mv README.cs.md docs/upstream-readme/`. The `merge=ours` rule only fires for *existing* paths, so a brand-new file slips through.

## Verified working as of 2026-05-07

- GWDG API key valid (32 hex chars).
- `GET /v1/models` returns 21 live models (all `status: ready`).
- 13 of 21 GWDG-served models return well-formed OpenAI tool calls (probed live). 8 fail with a vLLM-side `--enable-auto-tool-choice` server-config error and are configured `tool_call: false` in `opencode.json`.
- `gwdg/qwen3-coder-30b-a3b-instruct` is the recommended default for agentic use — fast, tool-capable, coding-tuned.
- Run `bun run gwdg:refresh` to re-probe (handy when GWDG enables tool calling on more deployments).

## Tasks that are still TODO

- Wire up TUDaGPT as a second provider once the base URL and auth are available.
- Tune `limit.context` and `limit.output` per model in `opencode.json` (currently mostly conservative 128k guesses).
- Build a release binary so the TUI can be launched from any project directory cleanly.
- Consider trimming OpenCode's default tool set (15+ tools) for smaller open-weight models that get confused by too many options. Hook: `packages/opencode/src/tool/registry.ts`.
- Write a Qwen-tuned system prompt and bind it via OpenCode's agent config.
