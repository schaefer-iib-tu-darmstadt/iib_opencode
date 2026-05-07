#!/usr/bin/env bun
//
// build-iibcode.ts
//
// Builds a single-platform binary of this opencode fork and renames it to
// "iibcode" so anyone who clones the repo can run `bun run iib:build` and get
// a drop-in CLI.
//
// Why a wrapper script and not a `pkg.name` rename in packages/opencode/package.json?
// -> Golden rule #1 in CLAUDE.md: don't modify upstream files. Renaming in
//    package.json would conflict on every `git merge upstream/dev`.
//
// Output:  <repo>/dist/iibcode[.exe]
//

import { $ } from "bun"
import path from "path"
import fs from "fs"

const repoRoot = path.resolve(import.meta.dirname, "..")
const opencodeDir = path.join(repoRoot, "packages", "opencode")

const platformOs = process.platform === "win32" ? "windows" : process.platform
const arch = process.arch
const exeExt = process.platform === "win32" ? ".exe" : ""

console.log(`[iibcode] building for ${platformOs}-${arch}...`)
await $`bun run build --single`.cwd(opencodeDir)

const sourceBin = path.join(
  opencodeDir,
  "dist",
  `opencode-${platformOs}-${arch}`,
  "bin",
  `opencode${exeExt}`,
)

if (!fs.existsSync(sourceBin)) {
  console.error(`[iibcode] expected binary not found: ${sourceBin}`)
  console.error(`[iibcode] check that the opencode build completed for this platform`)
  process.exit(1)
}

const outDir = path.join(repoRoot, "dist")
fs.mkdirSync(outDir, { recursive: true })
const outBin = path.join(outDir, `iibcode${exeExt}`)
fs.copyFileSync(sourceBin, outBin)
if (process.platform !== "win32") fs.chmodSync(outBin, 0o755)

const sizeMb = (fs.statSync(outBin).size / 1024 / 1024).toFixed(1)
console.log(`\n[iibcode] built: ${outBin} (${sizeMb} MB)`)
console.log(`\nTo use 'iibcode' from anywhere, put it on your PATH. For example:`)
if (process.platform === "win32") {
  console.log(`  Copy-Item "${outBin}" "$env:USERPROFILE\\.bun\\bin\\iibcode.exe"`)
  console.log(`  # ($env:USERPROFILE\\.bun\\bin is already on PATH if you installed bun)`)
} else {
  console.log(`  cp "${outBin}" ~/.bun/bin/iibcode    # if ~/.bun/bin is on your PATH`)
  console.log(`  # or:  sudo cp "${outBin}" /usr/local/bin/iibcode`)
}
