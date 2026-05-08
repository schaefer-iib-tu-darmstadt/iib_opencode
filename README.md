# iibcode — fork of [sst/opencode](https://github.com/sst/opencode)

A personal fork of OpenCode wired up to use the **GWDG Chat AI** and **TUDaGPT** university LLM gateways with open-weight models (Qwen3-Coder, Devstral, GLM, Mistral Large, etc.) instead of frontier closed models.

The idea: Claude Code-style interactive coding agent, but powered by models hosted on TU/GWDG infrastructure, fully open-source, no external API costs.

> Looking for the upstream OpenCode README (English + 21 translations)? See [`docs/upstream-readme/`](docs/upstream-readme/).

## What's customized

| | |
|---|---|
| `opencode.json` | Adds the `gwdg` provider (and later `tudagpt`) using `@ai-sdk/openai-compatible` |
| `README.md` (this file), `CLAUDE.md` | Fork-specific docs (quickstart + Claude Code context) |
| Everything else | Untouched upstream — pulls cleanly from `sst/opencode` |

## Quick start

### Prerequisites

- **Bun** ≥ 1.3 — `irm https://bun.com/install.ps1 | iex` (Windows) or see [bun.sh](https://bun.sh)
- **Git**
- A **GWDG API key** — book one at the [KISSKI LLM Service page](https://kisski.gwdg.de/leistungen/2-02-llm-service/)
- (optional) A **TUDaGPT API key** from TU Darmstadt HRZ — only works on the TU network

### Setup

```powershell
git clone <this-repo>
cd iib_opencode
bun install --ignore-scripts   # see "Known issues" below for why --ignore-scripts
[Environment]::SetEnvironmentVariable("GWDG_API_KEY", "your-key-here", "User")
# open a fresh shell so the env var is picked up
```

The `GWDG_API_KEY` is referenced in `opencode.json` as `{env:GWDG_API_KEY}` and resolved at runtime — the key itself is never committed.

### Verify it works

```powershell
bun dev models gwdg              # lists configured GWDG models
bun dev run --dir . "Reply with the single word PONG" -m gwdg/qwen3-coder-30b-a3b-instruct
bun run gwdg:refresh             # re-probe model list & tool-call support against the live API
```

### Run the interactive TUI (dev mode)

```powershell
bun dev                          # launches OpenCode TUI from source
```

`bun dev` runs straight from source — no build step — but inherits the `--cwd packages/opencode` gotcha (see Known issues). Fine for testing changes you make to the fork, **not** good for daily coding work in real projects. For that, build a real binary:

### Build & install the `iibcode` binary

```powershell
bun run iibcode:build                # produces dist/iibcode.exe (~150 MB), takes 1–3 min
```

Then put it on your PATH. The simplest spot is the bun bin folder, which is already on PATH from the bun install:

```powershell
Copy-Item dist\iibcode.exe "$env:USERPROFILE\.bun\bin\iibcode.exe"
iibcode --version                # verify it runs from any folder
```

(macOS/Linux: `cp dist/iibcode ~/.bun/bin/iibcode` or `sudo cp dist/iibcode /usr/local/bin/iibcode`.)

**One more step — make `iibcode` find the GWDG provider config from anywhere.** Drop a copy of `opencode.json` into the global opencode config dir so the `gwdg/...` models are visible no matter what folder you launch from. The location follows the XDG Base Directory spec; on Windows opencode uses `~/.config/opencode/` (not `%APPDATA%`):

```powershell
$cfgDir = "$env:USERPROFILE\.config\opencode"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
Copy-Item opencode.json "$cfgDir\opencode.json"
```

(macOS/Linux: `mkdir -p ~/.config/opencode && cp opencode.json ~/.config/opencode/opencode.json`.)

Now `iibcode` works in any directory and `/models` inside the TUI lists all 21 GWDG models.

#### Do I need to rebuild after editing the fork?

| What you changed | Rebuild needed? |
|---|---|
| `opencode.json` (model list, providers, limits) | **No** — read at runtime. Just edit and re-run `iibcode`. If you edited the global copy, that takes effect immediately too. |
| `scripts/*` (build, gwdg-refresh, etc.) | No — these are dev-time scripts, not bundled. |
| `packages/opencode/src/**` (TUI, tool dispatch, providers, anything in the source tree) | **Yes** — re-run `bun run iibcode:build` and copy the new `dist/iibcode.exe` over. |
| Just iterating quickly on source changes? | Skip the rebuild loop entirely — use `bun dev` (runs from source) until happy, then build once. |

**Rebuild quickstart** — run from the **repo root** (`iib_opencode/`):

```powershell
bun run iibcode:build                                                      # produces dist/iibcode.exe
Copy-Item dist\iibcode.exe "$env:USERPROFILE\.bun\bin\iibcode.exe" -Force   # overwrite the on-PATH binary
iibcode --version                                                          # sanity check
```

`bun run iibcode:build` MUST run from the repo root, not from `packages/opencode/`. The script (`scripts/build-iibcode.ts`) handles `cd`'ing into the right place internally and renames the output binary to `iibcode`. If you run `bun run build` from inside `packages/opencode/` you'll get an `opencode.exe` in `packages/opencode/dist/...` but nothing on PATH gets updated — that's the trap.

After every `bun run iibcode:build`, the build will dirty `bun.lock` and `packages/opencode/package.json` with line-ending changes on Windows. Don't commit those — `git checkout -- bun.lock packages/opencode/package.json` resets them.

## Available models

Configured in [`opencode.json`](opencode.json). All currently exposed via the `gwdg/` provider prefix. Ground-truthed against the live API on 2026-05-07 (re-run `bun run gwdg:refresh` to update).

### Tool-capable (13) — usable for agentic flows

- `qwen3-coder-30b-a3b-instruct` — **recommended default** for coding tasks (256k context)
- `qwen3.5-397b-a17b` — flagship Qwen, thinking/reasoning
- `qwen3.5-122b-a10b` — large Qwen, thinking
- `qwen3.5-35b-a3b` — mid Qwen, thinking
- `qwen3.5-27b` — small Qwen, thinking
- `qwen3.6-35b-a3b` — newer Qwen
- `qwen3-30b-a3b-instruct-2507` — older Qwen3 instruct
- `mistral-large-3-675b-instruct-2512` — flagship Mistral
- `devstral-2-123b-instruct-2512` — Mistral's coding-tuned model
- `glm-4.7` — strong on agentic tasks
- `openai-gpt-oss-120b` — OpenAI's open weights
- `llama-3.3-70b-instruct` — Meta's flagship
- `meta-llama-3.1-8b-instruct` — small Llama (fast smoke tests)

### Listed but no tool calling on GWDG today (8) — non-agentic only

These return HTTP 400 when sent a `tools` array. The cause is a server-side vLLM config gap (`--enable-auto-tool-choice` not set), not a model capability gap — they may light up if GWDG re-deploys them. Configured `tool_call: false` in `opencode.json`.

- `apertus-70b-instruct-2509`
- `qwen3-omni-30b-a3b-instruct` — also broken for plain chat (chat template error)
- `internvl3.5-30b-a3b` — vision + video
- `gemma-4-31b-it`, `gemma-3-27b-it`
- `medgemma-27b-it` — high demand (queues)
- `deepseek-r1-distill-llama-70b` — thinking
- `teuken-7b-instruct-research` — research-only

Full GWDG catalog: `GET https://chat-ai.academiccloud.de/v1/models` with `Authorization: Bearer $GWDG_API_KEY`.

## Pulling upstream updates

The fork is set up so `git pull` from `sst/opencode` never conflicts with our customizations.

```bash
git fetch upstream
git merge upstream/dev          # or rebase, your call
```

If you've created your own GitHub fork and want to push:

```bash
git remote add origin https://github.com/<you>/opencode.git
git push -u origin dev
```

## Known issues

### `bun install` fails on Windows without Visual Studio

`tree-sitter-powershell` needs node-gyp + a C++ compiler. Workaround: install with `--ignore-scripts`. Loses PowerShell syntax highlighting in the TUI; nothing else.

### `bun install` aborts with `EPERM` / `Fail extracting tarball` on TU-managed Windows (Sophos Intercept X)

On TU/HRZ-imaged Windows machines that ship with **Sophos Intercept X enterprise** (policy-locked — the Sophos UI says "managed by administrator" and you can't add file-system exclusions yourself), `bun install` will partially complete and then either hang or print errors like:

```
error: moving "<package>" to cache dir failed
EPERM: Operation not permitted (NtSetInformationFile())
error: Fail extracting tarball for "@cloudflare/workerd-windows-64"
error: Fail extracting tarball for "@pagefind/windows-x64"
error: Fail extracting tarball for "app-builder-bin"
error: Fail extracting tarball for "@ibm/plex"
```

**Cause:** Sophos's behavioural scanner holds open file handles on bun's freshly-extracted tarballs while bun tries to rename the temp directory to its final cache name (`<pkg>@<ver>@@@1`). The `NtSetInformationFile` rename racing against Sophos's scan loses with `EPERM`. The four packages listed above (`workerd`, `pagefind`, `app-builder-bin`, `@ibm/plex`) get hit hardest because they ship native Windows binaries / large blobs, which Sophos scans most aggressively.

**Workaround that worked on a managed TU laptop** (no admin, no IT ticket, no exclusions):

1. **Nuke any prior bun state** (so we start from a known baseline). Run in PowerShell:
   ```powershell
   Get-Process | Where-Object Name -like '*bun*' | Stop-Process -Force -ErrorAction SilentlyContinue
   [Environment]::SetEnvironmentVariable("BUN_INSTALL_CACHE_DIR", $null, "User")
   Remove-Item -Recurse -Force C:\bun-cache -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force $env:USERPROFILE\.bun -ErrorAction SilentlyContinue
   ```

2. **Install Bun via winget** (more reliable on PS 5.1 than `irm bun.com/install.ps1 | iex`, which fails with a 308 redirect on old PowerShell):
   ```powershell
   winget install -e --id Oven-sh.Bun
   ```

3. **Reboot the machine.** Clears any in-memory Sophos handle caches on the old bun paths. (Skipping this step still works for some users — try without first if you'd rather not reboot.)

4. **Open a new PowerShell**, `cd` into the repo, and run `bun install --ignore-scripts` **multiple times in a row**. The first run will partially fail (EPERM on a few packages, then hang on the final 4 tarball extractions — `Ctrl+C` it after ~3 min if it doesn't return). Each retry has more of the cache already populated, so fewer files race against Sophos at once. After 2–3 retries, `bun install --ignore-scripts` will exit `0` in <2 seconds:
   ```powershell
   cd C:\path\to\iib_opencode
   bun install --ignore-scripts        # may hang or print errors — Ctrl+C after a few min
   bun install --ignore-scripts        # likely exit 0 in 2s now
   bun install --ignore-scripts        # confirm idempotent
   bun dev models gwdg                 # smoke test — should list 21 models
   ```

**What doesn't help** (we tried, save yourself the time):

- Adding `BUN_INSTALL_CACHE_DIR` to a non-system path — Sophos doesn't care about the path
- `bunfig.toml` with `[install.cache] disable = true` — same EPERM, just on the temp extraction dir
- `--network-concurrency=1 --concurrent-scripts=1` — bun stalled silently for >5 min with throttled networking
- `Add-MpPreference` Defender exclusions — Defender isn't the blocker (Sophos is), and you can't exclude managed Sophos paths anyway
- `npm install` — fails immediately with `EUNSUPPORTEDPROTOCOL: catalog:` (the `catalog:` protocol is bun-specific)
- `pnpm install` — succeeds (different file-op pattern, doesn't trigger Sophos), but bun's runtime can't resolve some packages from pnpm's `.pnpm`-store layout (e.g. `mcp-oauth` import errors), so the resulting `node_modules` isn't usable for `bun dev`

**Why this works:** Sophos's behavioural scan loses interest in files it has already seen. As bun's cache fills up across retries, fewer files are "new" on each run, so fewer races happen, so more packages survive the rename. Eventually the install converges.

### `bun dev` thinks the project root is `packages/opencode`

The `dev` script in root `package.json` has `--cwd packages/opencode`. So when you run `bun dev run "..."`, OpenCode treats that subdirectory as the project. Workaround: pass `--dir <project-path>` to the `run` subcommand. The interactive TUI (`bun dev` with no args) inherits the same wrong cwd; for real use, build the binary and run from the actual project directory.

### 8 GWDG-served models don't currently expose tool calling

A vLLM-side server config gap on the GWDG deployment of these models — `--enable-auto-tool-choice` and `--tool-call-parser` aren't set, so any request with a `tools` array returns HTTP 400. They're configured `tool_call: false` in `opencode.json`, which means OpenCode won't expose its built-in tools to them and they can't drive agentic flows. They still work for plain chat. Re-run `bun run gwdg:refresh` if GWDG enables tool calling on more models.

## License

OpenCode is MIT-licensed. This fork remains MIT.
