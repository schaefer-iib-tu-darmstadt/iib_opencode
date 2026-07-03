# Releasing iibcode binaries

**Scope: Windows x64 only, for now.** iibcode's users (IIB colleagues and students) work on Windows with PowerShell; the setup script, docs, and released binaries target that. The source builds fine on macOS/Linux (`bun run iibcode:build` on the respective machine), but we don't test or ship those — they may be added later.

## Manual release (the current process)

From a Windows machine with the repo set up ([development.md](development.md)):

```powershell
# 1. Build from a clean, committed state
git status                        # should be clean
bun run iibcode:build             # → dist/iibcode.exe (~150 MB)

# 2. Smoke-test the binary
dist\iibcode.exe --version
dist\iibcode.exe run --dir . "Reply with PONG" -m gwdg/qwen3-coder-30b-a3b-instruct

# 3. Reset build noise before tagging (line endings only, never commit)
git checkout -- bun.lock packages/opencode/package.json

# 4. Tag the release
git tag iibcode-vX.Y
git push origin iibcode-vX.Y
```

Then upload `dist\iibcode.exe` to the GitLab release:

1. Upload the binary to the generic package registry (needs a token with `api` scope):
   ```powershell
   $proj = "tuda-iib%2Fiibai%2Fiibcode"
   Invoke-RestMethod -Method Put `
     -Uri "https://git-ce.rwth-aachen.de/api/v4/projects/$proj/packages/generic/iibcode/vX.Y/iibcode.exe" `
     -Headers @{ "PRIVATE-TOKEN" = $env:GITLAB_TOKEN } `
     -InFile "dist\iibcode.exe"
   ```
2. On GitLab: **Deployments → Releases → New release**, pick the tag, and add the package-registry URL as a release asset link.

Users then download `iibcode.exe`, put it somewhere on PATH, set `GWDG_API_KEY`, and copy the [global config](../README.md#setup) — no Bun, no clone, no build.

## Automating via GitLab CI (not active yet)

The upstream build script cross-compiles (Bun supports `--target=bun-windows-x64`), but our wrapper builds `--single` for the current platform, and none of this is tested on the RWTH GitLab runners. Before activating CI:

1. Confirm what runners `git-ce.rwth-aachen.de` offers this project (Linux Docker? Windows?).
2. On a Windows runner, the job is just `bun install --ignore-scripts && bun run iibcode:build` plus the registry upload above.
3. On a Linux-only runner, `scripts/build-iibcode.ts` would need a `--target windows-x64` option first (upstream's `packages/opencode/script/build.ts` already knows the target matrix — run it without `--single` and pick the `windows-x64` output).

Starting-point snippet for `.gitlab-ci.yml` (manual, tag-only, Windows runner):

```yaml
release-windows:
  stage: deploy
  rules:
    - if: $CI_COMMIT_TAG =~ /^iibcode-v/
      when: manual
  tags: [windows]
  script:
    - bun install --ignore-scripts
    - bun run iibcode:build
    - 'curl --header "JOB-TOKEN: $CI_JOB_TOKEN" --upload-file dist/iibcode.exe "$CI_API_V4_URL/projects/$CI_PROJECT_ID/packages/generic/iibcode/$CI_COMMIT_TAG/iibcode.exe"'
```
