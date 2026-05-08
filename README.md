# iibcode

A coding agent that runs on TU/GWDG infrastructure — not on closed frontier APIs.

iibcode is a personal fork of [anomalyco/opencode](https://github.com/anomalyco/opencode) wired up to the **GWDG ChatAI** and **TUDaGPT** university LLM gateways. Same Claude Code-style interactive TUI, powered by open-weight models (Qwen3-Coder, Devstral, GLM, Mistral Large, …) hosted on university infrastructure. No external API costs, no data leaving the university network.

<p align="center">
  <img src="docs/images/iibcode.png" width="800" alt="iibcode TUI running against the GWDG API">
</p>

## Prerequisites

- **Bun** ≥ 1.3 — `irm https://bun.com/install.ps1 | iex` on Windows, or see [bun.sh](https://bun.sh)
- **Git**
- A **GWDG API key** — request one at the [KISSKI LLM Service page](https://kisski.gwdg.de/leistungen/2-02-llm-service/)
- *(optional)* A **TUDaGPT API key** from TU Darmstadt HRZ — only works on the TU network

## Setup

Clone, install dependencies, store the API key:

```powershell
git clone https://git-ce.rwth-aachen.de/tuda-iib/iibai/iibcode.git
cd iibcode
bun install --ignore-scripts          # see Known issues for why --ignore-scripts
[Environment]::SetEnvironmentVariable("GWDG_API_KEY", "your-key-here", "User")
# open a fresh shell so the env var is visible
```

The key is referenced in `opencode.json` as `{env:GWDG_API_KEY}` and resolved at runtime — never committed.

## Build the `iibcode` binary

Compile a standalone `iibcode` binary so you can launch the TUI from any project folder:

```powershell
bun run iibcode:build                                                  # → dist/iibcode.exe (~150 MB, 1–3 min)
Copy-Item dist\iibcode.exe "$env:USERPROFILE\.bun\bin\iibcode.exe"     # put it on PATH
iibcode --version
```

(macOS/Linux: `cp dist/iibcode ~/.bun/bin/iibcode`, or `sudo cp dist/iibcode /usr/local/bin/iibcode`.)

**Make the GWDG provider config global.** Drop a copy of `opencode.json` into the user-level config dir so the `gwdg/...` models are visible from any working directory. Windows opencode follows the XDG spec (`~/.config/opencode/`), not `%APPDATA%`:

```powershell
$cfgDir = "$env:USERPROFILE\.config\opencode"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
Copy-Item opencode.json "$cfgDir\opencode.json"
```

(macOS/Linux: `mkdir -p ~/.config/opencode && cp opencode.json ~/.config/opencode/`.)

## Use it

```bash
cd path/to/your/project
iibcode                                                                # interactive TUI
iibcode run "explain the auth flow" -m gwdg/qwen3-coder-30b-a3b-instruct  # one-shot
```

`gwdg/qwen3-coder-30b-a3b-instruct` is the recommended default for coding work. Inside the TUI, `/models` lists all 21 configured GWDG models.

---

## Available models

Configured in [`opencode.json`](opencode.json), all under the `gwdg/` provider prefix. Ground-truthed against the live API on 2026-05-07 — re-run `bun run gwdg:refresh` to update.

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

## Updating from upstream OpenCode

GitLab has no equivalent of GitHub's "Sync fork" button for cross-host upstreams. The `upstream` remote is preconfigured to point at `anomalyco/opencode`, so syncing is three commands from the repo root:

```bash
git fetch upstream
git merge upstream/dev          # or rebase, your call
git push origin dev             # publish the merged history to GitLab
```

The `merge=ours` driver auto-keeps our `README.md` and `docs/upstream-readme/` on conflict (one-time per clone: `git config merge.ours.driver true`). If upstream adds a new translation file (e.g. `README.cs.md`) it'll appear at the repo root after merge — move it: `git mv README.cs.md docs/upstream-readme/`. The `merge=ours` rule only fires for *existing* paths, so brand-new files slip through.

## Developer workflow

### Run from source (no build step)

Useful while iterating on fork-internal changes:

```powershell
bun dev                                                                       # interactive TUI from source
bun dev models gwdg                                                           # list configured models
bun dev run --dir . "Reply with PONG" -m gwdg/qwen3-coder-30b-a3b-instruct    # one-shot
```

`bun dev` inherits a `--cwd packages/opencode` (see Known issues), so it's only good for testing fork edits — pass `--dir <path>` to `run` to override. For daily coding work in real projects, use the built binary above.

### Rebuild after editing the fork

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

### Re-probe the GWDG model catalog

```powershell
bun run gwdg:refresh
```

Updates `opencode.json` with the current model list and tool-call support flags. Run when GWDG enables tool calling on more deployments or adds new models.

## What's customized in this fork

| | |
|---|---|
| `opencode.json` | Adds the `gwdg` provider (and later `tudagpt`) using `@ai-sdk/openai-compatible` |
| `README.md`, `CLAUDE.md` | Fork-specific docs |
| `.gitattributes` | Marks our docs as `merge=ours` so upstream syncs don't conflict |
| Everything else | Untouched upstream — pulls cleanly from `anomalyco/opencode` |

The original upstream OpenCode README (English + 21 translations) lives in [`docs/upstream-readme/`](docs/upstream-readme/).

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
   cd C:\path\to\iibcode
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

### `git push` pre-push hook fails on `packages/{app,enterprise}/src/custom-elements.d.ts`

The pre-push hook runs `bun turbo typecheck` across the whole monorepo. On Windows, it'll fail with:

```
@opencode-ai/app:typecheck:
  src/custom-elements.d.ts(1,1): error TS1128: Declaration or statement expected.
husky - pre-push script failed (code 1)
```

**Cause:** that file is a git symlink (mode `120000`) pointing to `../../ui/src/custom-elements.d.ts`. Without `core.symlinks=true`, git checks it out as a 33-byte text file containing the literal path string, which TypeScript can't parse. Enabling `core.symlinks` on Windows additionally requires **Developer Mode** (`Settings → System → For developers → Developer Mode`) or admin privileges, since regular users can't create symlinks.

**Workarounds, in order of preference:**

1. **Enable Developer Mode**, then once per clone:
   ```bash
   git config core.symlinks true
   git checkout -- packages/app/src/custom-elements.d.ts packages/enterprise/src/custom-elements.d.ts
   ```
   Persistent fix; the typecheck then passes.
2. **Bypass the hook** for a single push: `git push --no-verify`. Reasonable when your changes are confined to `packages/opencode/` (we don't ship the `app` or `enterprise` packages from this fork anyway), but you lose the local typecheck on your own changes too — run `bun turbo typecheck --filter=opencode` first to keep that safety net.

We don't build or use `@opencode-ai/app` or `@opencode-ai/enterprise` in this fork, so the failure is purely a checkout-format problem, not a code problem.

### 8 GWDG-served models don't currently expose tool calling

A vLLM-side server config gap on the GWDG deployment of these models — `--enable-auto-tool-choice` and `--tool-call-parser` aren't set, so any request with a `tools` array returns HTTP 400. They're configured `tool_call: false` in `opencode.json`, which means OpenCode won't expose its built-in tools to them and they can't drive agentic flows. They still work for plain chat. Re-run `bun run gwdg:refresh` if GWDG enables tool calling on more models.

## License

OpenCode is MIT-licensed. This fork remains MIT.
