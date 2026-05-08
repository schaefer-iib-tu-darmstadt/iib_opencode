# Troubleshooting

Edge cases collected from real installs. If you don't recognize a symptom here, the [`anomalyco/opencode`](https://github.com/anomalyco/opencode) issue tracker covers upstream-side problems.

## `bun install` fails on Windows without Visual Studio

`tree-sitter-powershell` needs node-gyp + a C++ compiler. Workaround: install with `--ignore-scripts`. You lose PowerShell syntax highlighting in the TUI; nothing else.

## `bun install` aborts with `EPERM` / `Fail extracting tarball` on TU-managed Windows (Sophos Intercept X)

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

**Why the workaround works:** Sophos's behavioural scan loses interest in files it has already seen. As bun's cache fills up across retries, fewer files are "new" on each run, so fewer races happen, so more packages survive the rename. Eventually the install converges.

## `bun dev` thinks the project root is `packages/opencode`

The `dev` script in root `package.json` has `--cwd packages/opencode`. So when you run `bun dev run "..."`, OpenCode treats that subdirectory as the project. Workaround: pass `--dir <project-path>` to the `run` subcommand. The interactive TUI (`bun dev` with no args) inherits the same wrong cwd; for real use, build the binary and run from the actual project directory.

## `git push` pre-push hook fails on `packages/{app,enterprise}/src/custom-elements.d.ts`

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

## 8 GWDG-served models don't currently expose tool calling

A vLLM-side server config gap on the GWDG deployment of these models — `--enable-auto-tool-choice` and `--tool-call-parser` aren't set, so any request with a `tools` array returns HTTP 400. They're configured `tool_call: false` in `opencode.json`, which means OpenCode won't expose its built-in tools to them and they can't drive agentic flows. They still work for plain chat. Re-run `bun run gwdg:refresh` if GWDG enables tool calling on more models. The full list of affected models is in [models.md](models.md).
