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
//   5. store GWDG_API_KEY as a user env var (always prompted, validated against
//      GWDG before storing; blank keeps the current key; never written to the repo)
//
// What this CANNOT do for you (by design, not laziness):
//   - obtain a GWDG API key — that's per person; have it ready before running.
//   - make the key visible in THIS shell — env vars only apply to shells started
//     after they're set, so open a fresh terminal when the script tells you to.
//
// Usage:  bun run setup
//
// Safe to re-run: install/build/copy/global-config are idempotent; the key step
// always prompts (blank keeps the current key) and validates before storing.
//

import { $ } from "bun"
import path from "path"
import os from "os"
import fs from "fs"
// Reuse the fork's GWDG key check (GET /v1/models, classified) so setup can retry
// on a bad key. gwdg-refresh.ts imports only node:fs/os/path — safe to run via Bun.
import { validateApiKey } from "../packages/opencode/src/cli/cmd/tui/util/gwdg-refresh"

const repoRoot = path.resolve(import.meta.dirname, "..")
const isWin = process.platform === "win32"
const exeExt = isWin ? ".exe" : ""

// Don't let a failed sub-step abort with an opaque Bun stack trace.
$.throws(false)

function step(n: number, msg: string) {
  console.log(`\n[setup] (${n}/5) ${msg}`)
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
step(5, "store GWDG_API_KEY")
{
  const existing = (process.env.GWDG_API_KEY ?? "").trim()
  if (existing) console.log(`[setup] A GWDG_API_KEY is already set (…${existing.slice(-4)}).`)

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

  // Always prompt (even if a key is set — it may be stale, which was the whole
  // problem). Blank keeps the current key (or defers if none). A pasted key is
  // tested against GWDG before storing; on any failure we re-prompt, with blank
  // as the escape hatch.
  while (true) {
    const promptMsg = existing
      ? "[setup] Paste your GWDG_API_KEY (blank = keep current key):"
      : "[setup] Paste your GWDG_API_KEY (blank = set it later):"
    const key = (prompt(promptMsg) ?? "").trim()

    if (!key) {
      if (existing) console.log("[setup] Keeping the current GWDG_API_KEY.")
      else printManualHint()
      break
    }

    console.log("[setup] Testing the key against GWDG /v1/models…")
    const check = await validateApiKey(key)
    if (check.valid) {
      await storeKey(key)
      break
    }
    if (check.reason === "unauthorized")
      console.error(`[setup] Key rejected by GWDG (HTTP ${check.status}). Check it and try again.`)
    else if (check.reason === "server") console.error(`[setup] GWDG returned HTTP ${check.status}. Try again.`)
    else console.error("[setup] Couldn't reach GWDG (network/timeout). Try again, or leave blank to skip for now.")
  }
}

// --- done -------------------------------------------------------------------
console.log("\n[setup] Done. Next:")
console.log("[setup]   1. Open a NEW terminal (so GWDG_API_KEY is visible).")
console.log("[setup]   2. cd into any project folder.")
console.log("[setup]   3. Run:  iibcode")
