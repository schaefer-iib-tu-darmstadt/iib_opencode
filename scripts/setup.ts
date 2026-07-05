#!/usr/bin/env bun
//
// setup.ts
//
// One-command onboarding for a fresh clone. Chains the fiddly manual steps a new
// user would otherwise copy out of the README:
//
//   1. bun install --ignore-scripts        (native tree-sitter build is skipped;
//                                            fix-node-pty runs later in the build)
//   2. bun run iibcode:build               (compiles dist/iibcode[.exe])
//   3. copy the binary onto PATH           (~/.bun/bin/iibcode[.exe])
//   4. bun run setup:global-config         (gwdg provider visible from any dir)
//   5. store GWDG_API_KEY as a user env var (always prompted; an already-set key is
//      validated against GWDG too, so a stale one is caught instead of silently
//      kept; a pasted key is validated before storing; never written to the repo)
//   6. sync the model catalog once (headless /models-refresh against BOTH the
//      project-local and global opencode.json, so the first `iibcode` launch lists
//      the live GWDG models instead of the committed snapshot; best-effort)
//
// What this CANNOT do for you (by design, not laziness):
//   - obtain a GWDG API key — that's per person; have it ready before running.
//   - make the key visible in THIS shell — env vars only apply to shells started
//     after they're set, so open a fresh terminal when the script tells you to.
//
// Usage:  bun run setup
//
// Safe to re-run: install/build/copy/global-config are idempotent; the key step
// always prompts (blank keeps a *validated* current key) and validates before
// storing; the catalog sync is a best-effort, non-fatal mirror of GWDG.
//

import { $ } from "bun"
import path from "path"
import os from "os"
import fs from "fs"
// Reuse the fork's GWDG key check (GET /v1/models, classified) so setup can retry
// on a bad key. gwdg-refresh.ts imports only node:fs/os/path — safe to run via Bun.
import {
  validateApiKey,
  resolveConfigTargets,
  syncCatalogToConfigs,
} from "../packages/opencode/src/cli/cmd/tui/util/gwdg-refresh"

const repoRoot = path.resolve(import.meta.dirname, "..")
const isWin = process.platform === "win32"
const exeExt = isWin ? ".exe" : ""

// Don't let a failed sub-step abort with an opaque Bun stack trace.
$.throws(false)

function step(n: number, msg: string) {
  console.log(`\n[setup] (${n}/6) ${msg}`)
}

// --- 1. install dependencies ------------------------------------------------
// --ignore-scripts is mandatory in this repo: without VS C++ Build Tools the
// tree-sitter-powershell postinstall fails on Windows. The build step runs
// fix-node-pty itself, so nothing needed here is lost by skipping scripts.
step(1, "bun install --ignore-scripts")
{
  const r = await $`bun install --ignore-scripts`.cwd(repoRoot)
  if (r.exitCode !== 0) {
    console.error("[setup] dependency install failed — see docs/troubleshooting.md")
    process.exit(1)
  }
}

// --- 2. build the binary ----------------------------------------------------
step(2, "bun run iibcode:build (this takes 1-3 min)")
{
  const r = await $`bun run iibcode:build`.cwd(repoRoot)
  if (r.exitCode !== 0) {
    console.error("[setup] build failed")
    process.exit(1)
  }
}

// --- 3. put the binary on PATH ----------------------------------------------
// ~/.bun/bin is on PATH when bun was installed via the official installer
// (README prerequisite). Warn instead of failing if it isn't.
step(3, "install binary onto PATH")
const builtBin = path.join(repoRoot, "dist", `iibcode${exeExt}`)
const binDir = path.join(os.homedir(), ".bun", "bin")
const targetBin = path.join(binDir, `iibcode${exeExt}`)
if (!fs.existsSync(builtBin)) {
  console.error(`[setup] expected build output missing: ${builtBin}`)
  process.exit(1)
}
fs.mkdirSync(binDir, { recursive: true })
fs.copyFileSync(builtBin, targetBin)
if (!isWin) fs.chmodSync(targetBin, 0o755)
console.log(`[setup] copied -> ${targetBin}`)

const pathDirs = (process.env.PATH ?? "").split(path.delimiter).map((p) => p.replace(/[/\\]+$/, ""))
if (!pathDirs.includes(binDir.replace(/[/\\]+$/, ""))) {
  console.warn(`[setup] NOTE: ${binDir} is not on your PATH.`)
  console.warn(
    isWin
      ? `[setup]   Add it (User env) and open a new shell, or run the copied path directly.`
      : `[setup]   Add it to your shell profile: export PATH="$HOME/.bun/bin:$PATH"`,
  )
}

// --- 4. sync the provider config globally -----------------------------------
// Non-fatal: install-global-config exits non-zero if a *different* global config
// already exists (re-run scenario). Surface the hint but keep going.
step(4, "bun run setup:global-config")
{
  const r = await $`bun run setup:global-config`.cwd(repoRoot)
  if (r.exitCode !== 0) {
    console.warn("[setup] global config not written (it may already exist and differ).")
    console.warn("[setup]   To overwrite: bun run setup:global-config -- --force")
  }
}

// --- 5. store the API key ---------------------------------------------------
// The validated key (a freshly stored one, or a confirmed-good existing one) is
// handed to step 6 for the catalog sync — after setx it's NOT visible in this
// process's env, so we must carry it in-memory. Stays undefined if the user
// defers the key or keeps a known-bad one, which makes step 6 skip.
let validatedKey: string | undefined
step(5, "store GWDG_API_KEY")
{
  const existing = (process.env.GWDG_API_KEY ?? "").trim()

  // Unlike before, an already-set key is now tested against GWDG up front — a
  // stale/expired key used to slip through silently when the user left the prompt
  // blank ("it's already set"). `network` (GWDG unreachable) is treated as
  // "unconfirmed", not invalid: we keep the key but say we couldn't verify it.
  let existingValid = false
  let existingUnverified = false
  if (existing) {
    console.log(`[setup] A GWDG_API_KEY is already set (…${existing.slice(-4)}). Testing it against GWDG…`)
    const check = await validateApiKey(existing)
    if (check.valid) {
      existingValid = true
      validatedKey = existing
      console.log("[setup] Current key is valid.")
    } else if (check.reason === "unauthorized") {
      console.warn(`[setup] Current key was REJECTED by GWDG (HTTP ${check.status}). Paste a fresh one below.`)
    } else if (check.reason === "server") {
      existingUnverified = true
      validatedKey = existing // couldn't confirm, but let step 6 try — it's best-effort
      console.warn(`[setup] GWDG returned HTTP ${check.status}; couldn't verify the current key. Assuming it's fine.`)
    } else {
      existingUnverified = true
      validatedKey = existing // network blip: keep the key and let step 6 try anyway
      console.warn("[setup] Couldn't reach GWDG to verify the current key (network/timeout). Assuming it's fine.")
    }
  }

  // Persist a validated key. Windows: setx -> User env (HKCU\Environment), same
  // target as [Environment]::SetEnvironmentVariable(..., "User"). Else: rewrite
  // the export line in the login shell's rc (updating, not just appending, so a
  // re-run replaces a stale key instead of piling up duplicates). Neither affects
  // the current process — a fresh shell is required.
  async function storeKey(key: string): Promise<void> {
    if (isWin) {
      const r = await $`cmd /c setx GWDG_API_KEY ${key}`.quiet()
      if (r.exitCode === 0) console.log("[setup] GWDG_API_KEY saved to your User environment.")
      else console.error("[setup] Could not set the env var automatically — set it manually (see README).")
      return
    }
    const shell = process.env.SHELL ?? ""
    const rc = shell.includes("zsh")
      ? path.join(os.homedir(), ".zshrc")
      : shell.includes("bash")
        ? path.join(os.homedir(), ".bashrc")
        : path.join(os.homedir(), ".profile")
    const contents = fs.existsSync(rc) ? fs.readFileSync(rc, "utf8") : ""
    const exportLine = `export GWDG_API_KEY="${key}"`
    if (/^export GWDG_API_KEY=.*$/m.test(contents)) {
      fs.writeFileSync(rc, contents.replace(/^export GWDG_API_KEY=.*$/m, exportLine))
      console.log(`[setup] Updated GWDG_API_KEY in ${rc}.`)
    } else {
      fs.appendFileSync(rc, `\n${exportLine}\n`)
      console.log(`[setup] Added GWDG_API_KEY to ${rc}.`)
    }
  }

  function printManualHint(): void {
    console.log("[setup] Set it later, then open a fresh shell:")
    console.log(
      isWin
        ? `[setup]   [Environment]::SetEnvironmentVariable("GWDG_API_KEY", "your-key", "User")`
        : `[setup]   echo 'export GWDG_API_KEY="your-key"' >> ~/.zshrc   # or ~/.bashrc`,
    )
  }

  // Always prompt, even with a key set — it may be stale. The prompt text and what
  // "blank" does now depend on the up-front check above: blank keeps a validated
  // (or unverifiable) current key, warns when it keeps a known-bad one, and defers
  // when there's none. A pasted key is tested before storing; on failure we
  // re-prompt, with blank as the escape hatch.
  const existingBad = !!existing && !existingValid && !existingUnverified
  while (true) {
    const promptMsg = existingValid
      ? "[setup] Paste a GWDG_API_KEY to replace it (blank = keep current validated key):"
      : existingUnverified
        ? "[setup] Paste a GWDG_API_KEY (blank = keep current unverified key):"
        : existing
          ? "[setup] Paste a valid GWDG_API_KEY (blank = keep the rejected key anyway):"
          : "[setup] Paste your GWDG_API_KEY (blank = set it later):"
    const key = (prompt(promptMsg) ?? "").trim()

    if (!key) {
      if (existingBad) console.warn("[setup] Keeping the current GWDG_API_KEY, but GWDG rejected it — iibcode will fail until it's fixed.")
      else if (existing) console.log("[setup] Keeping the current GWDG_API_KEY.")
      else printManualHint()
      break
    }

    console.log("[setup] Testing the key against GWDG /v1/models…")
    const check = await validateApiKey(key)
    if (check.valid) {
      await storeKey(key)
      validatedKey = key
      break
    }
    if (check.reason === "unauthorized")
      console.error(`[setup] Key rejected by GWDG (HTTP ${check.status}). Check it and try again.`)
    else if (check.reason === "server") console.error(`[setup] GWDG returned HTTP ${check.status}. Try again.`)
    else console.error("[setup] Couldn't reach GWDG (network/timeout). Try again, or leave blank to skip for now.")
  }
}

// --- 6. sync the model catalog once -----------------------------------------
// Run the headless equivalent of /models-refresh against BOTH the project-local
// (repo) and global opencode.json so the first `iibcode` launch shows the live
// GWDG catalog, not the committed snapshot (which drifts as GWDG adds/decommissions
// models). Uses the in-memory validatedKey — after setx the key isn't in this
// process's env yet. Entirely best-effort: any failure (offline, GWDG 5xx, docs
// scrape) is a warning, never a setup failure. NOTE: editing the repo's tracked
// opencode.json leaves the working tree dirty — that's intended (the user asked to
// sync both configs); the closing text flags it.
step(6, "sync GWDG model catalog")
let catalogSynced = false
if (!validatedKey) {
  console.log("[setup] No validated key available — skipping catalog sync.")
  console.log("[setup]   Run /models-refresh inside the TUI once your key works.")
} else {
  try {
    const targets = await resolveConfigTargets(repoRoot)
    if (targets.paths.length === 0) {
      console.warn(`[setup] No opencode.json found (project: ${targets.projectDir}, global: ${targets.globalPath}) — skipping sync.`)
    } else {
      const result = await syncCatalogToConfigs({
        apiKey: validatedKey,
        configPaths: targets.paths,
        // Headless: no confirmation prompt — always probe the new models.
        confirmProbe: async () => true,
        onProgress: (m) => console.log(`[setup]   ${m}`),
      })
      catalogSynced = result.wroteAny
      const parts = [`Added ${result.added.length}`]
      if (result.removed.length > 0) parts.push(`removed ${result.removed.length}`)
      if (result.limitUpdated.length > 0) parts.push(`updated ${result.limitUpdated.length} context limit(s)`)
      if (result.skipped > 0) parts.push(`skipped ${result.skipped} without tool calling`)
      if (result.wroteAny)
        console.log(`[setup] ${parts.join(", ")} across ${targets.paths.length} config(s).`)
      else console.log(`[setup] All ${result.readyCount} GWDG models already match ${targets.paths.length} config(s).`)
    }
  } catch (e) {
    console.warn(`[setup] Catalog sync skipped (${e instanceof Error ? e.message : String(e)}).`)
    console.warn("[setup]   Not fatal — run /models-refresh inside the TUI later.")
  }
}

// --- done -------------------------------------------------------------------
console.log("\n[setup] Done. Next:")
console.log("[setup]   1. Open a NEW terminal (so GWDG_API_KEY is visible).")
console.log("[setup]   2. cd into any project folder.")
console.log("[setup]   3. Run:  iibcode")
if (catalogSynced)
  console.log("[setup]   (model catalog was synced — `git diff opencode.json` may show changes; commit or discard as you like.)")
