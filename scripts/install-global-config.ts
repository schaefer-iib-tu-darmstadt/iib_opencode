#!/usr/bin/env bun
//
// install-global-config.ts
//
// Copies the project's opencode.json to the user-level config dir so the
// `gwdg/...` provider definition (and `enabled_providers` allowlist) are
// visible when iibcode runs from any working directory — not just inside
// this repo.
//
// Why this matters: opencode loads config in two layers, project and global.
// When you launch the built `iibcode` binary outside this repo, only the
// global config applies. Without this step, opencode's built-in `opencode`
// cloud provider auto-loads with `apiKey: "public"` and shows free models
// (big-pickle, minimax-m2.5-free, etc.) you didn't ask for.
//
// Path resolution mirrors @opencode-ai/core/global (which uses xdg-basedir):
//   $XDG_CONFIG_HOME/opencode/opencode.json
//   defaulting to ~/.config/opencode/opencode.json on every platform,
//   including Windows (opencode does NOT use %APPDATA%).
//
// Usage:
//   bun run setup:global-config            # prompt before overwriting
//   bun run setup:global-config -- --force # overwrite without prompting
//

import path from "path"
import os from "os"
import fs from "fs"

const repoRoot = path.resolve(import.meta.dirname, "..")
const projectConfig = path.join(repoRoot, "opencode.json")

const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
const globalDir = path.join(xdgConfigHome, "opencode")
const globalConfig = path.join(globalDir, "opencode.json")

const force = process.argv.includes("--force")

if (!fs.existsSync(projectConfig)) {
  console.error(`[install-global-config] missing ${projectConfig}`)
  process.exit(1)
}

fs.mkdirSync(globalDir, { recursive: true })

if (fs.existsSync(globalConfig) && !force) {
  const incoming = fs.readFileSync(projectConfig)
  const existing = fs.readFileSync(globalConfig)
  if (incoming.equals(existing)) {
    console.log(`[install-global-config] already up to date: ${globalConfig}`)
    process.exit(0)
  }
  console.error(`[install-global-config] global config exists and differs:\n  ${globalConfig}`)
  console.error(`[install-global-config] re-run with --force to overwrite, e.g.:`)
  console.error(`  bun run setup:global-config -- --force`)
  process.exit(1)
}

fs.copyFileSync(projectConfig, globalConfig)
console.log(`[install-global-config] wrote ${globalConfig}`)
