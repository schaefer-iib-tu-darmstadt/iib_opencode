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
//   5. store GWDG_API_KEY as a user env var (prompted; never written to the repo)
//
// What this CANNOT do for you (by design, not laziness):
//   - obtain a GWDG API key — that's per person; have it ready before running.
//   - make the key visible in THIS shell — env vars only apply to shells started
//     after they're set, so open a fresh terminal when the script tells you to.
//
// Usage:  bun run setup
//
// Safe to re-run: install/build/copy/global-config are idempotent; the key step
// is skipped if GWDG_API_KEY is already set.
//

import { $ } from "bun"
import path from "path"
import os from "os"
import fs from "fs"

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
if (process.env.GWDG_API_KEY) {
  console.log("[setup] GWDG_API_KEY is already set in this environment — skipping.")
} else {
  const key = (prompt("[setup] Paste your GWDG_API_KEY (or leave blank to set it later):") ?? "").trim()
  if (!key) {
    console.log("[setup] Skipped. Set it later, then open a fresh shell:")
    console.log(
      isWin
        ? `[setup]   [Environment]::SetEnvironmentVariable("GWDG_API_KEY", "your-key", "User")`
        : `[setup]   echo 'export GWDG_API_KEY="your-key"' >> ~/.zshrc   # or ~/.bashrc`,
    )
  } else if (isWin) {
    // setx persists to the User environment (HKCU\Environment), same target as
    // [Environment]::SetEnvironmentVariable(..., "User"). It does not affect the
    // current process — a new shell is required.
    const r = await $`cmd /c setx GWDG_API_KEY ${key}`.quiet()
    if (r.exitCode === 0) console.log("[setup] GWDG_API_KEY saved to your User environment.")
    else console.error("[setup] Could not set the env var automatically — set it manually (see README).")
  } else {
    // Append an export line to the login shell's rc file, unless it already
    // references the key (avoid piling up duplicate exports on re-runs).
    const shell = process.env.SHELL ?? ""
    const rc = shell.includes("zsh")
      ? path.join(os.homedir(), ".zshrc")
      : shell.includes("bash")
        ? path.join(os.homedir(), ".bashrc")
        : path.join(os.homedir(), ".profile")
    const existing = fs.existsSync(rc) ? fs.readFileSync(rc, "utf8") : ""
    if (existing.includes("GWDG_API_KEY")) {
      console.log(`[setup] ${rc} already references GWDG_API_KEY — leaving it untouched.`)
    } else {
      fs.appendFileSync(rc, `\nexport GWDG_API_KEY="${key}"\n`)
      console.log(`[setup] Added GWDG_API_KEY to ${rc}.`)
    }
  }
}

// --- done -------------------------------------------------------------------
console.log("\n[setup] Done. Next:")
console.log("[setup]   1. Open a NEW terminal (so GWDG_API_KEY is visible).")
console.log("[setup]   2. cd into any project folder.")
console.log("[setup]   3. Run:  iibcode")
