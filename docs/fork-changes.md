# What this fork changes vs. upstream opencode

The canonical list of every deviation from [anomalyco/opencode](https://github.com/anomalyco/opencode). If you're resolving a merge conflict during an upstream sync, or just want to know "what is iibcode, exactly?", start here.

**Ground truth:** this document describes the intended state; the actual diff is always

```bash
git diff --stat $(git merge-base HEAD upstream/dev) -- packages/ package.json .gitignore
```

Everything not listed below is untouched upstream code.

## Design principles

1. **Prefer config over code.** The GWDG provider, model list, and limits live entirely in `opencode.json` — no source change needed.
2. **Prefer new files over edited files.** Fork features live in their own files (zero merge-conflict risk); upstream files get only the minimal hook lines to wire them up.
3. **Every edit in an upstream file is an additive, commented block.** On merge conflict: keep upstream's version of the surrounding code, re-apply our block, rebuild.
4. **Docs are whole-file-owned** and protected by the `merge=ours` driver (see [maintainer-sync.md](maintainer-sync.md)).

## Fork-owned files (no merge risk)

| Path | What |
|---|---|
| `opencode.json` | The `gwdg` provider: 14 tool-capable models, per-model `tool_call` / `limit` / `reasoning` flags, `enabled_providers` allowlist. Upstream gitignores this path; we un-ignored it. |
| `README.md` | iibcode quickstart (upstream's README moved to `docs/upstream-readme/`) |
| `docs/*.md`, `docs/images/`, `docs/upstream-readme/` | All fork documentation + the archived upstream README and its 21 translations |
| `ROADMAP.md`, `CLAUDE.md`, `.gitattributes` | Roadmap, agent context, `merge=ours` markers |
| `scripts/setup.ts` | One-command onboarding: `bun run setup`. Validates both an already-set and a freshly pasted `GWDG_API_KEY` against GWDG (a stale existing key no longer slips through), then runs a headless one-shot catalog sync (step 6, `syncCatalogToConfigs`) over the project-local + global `opencode.json` so the first launch shows live models. |
| `scripts/build-iibcode.ts` | Builds `dist/iibcode[.exe]`: `bun run iibcode:build` |
| `scripts/install-global-config.ts` | Syncs `opencode.json` → `~/.config/opencode/`: `bun run setup:global-config` |
| `packages/opencode/src/cli/brand.ts` | Brand strings (`iibcode` / `iib`) used by the terminal-title patch in `app.tsx` |
| `packages/opencode/src/cli/cmd/tui/util/gwdg-refresh.ts` | `/models-refresh` logic: fetch GWDG catalog, probe tool-call support by HTTP status (2xx accept / 4xx reject / retry transient 5xx·429·408), scrape context windows from the GWDG docs, write `opencode.json`. Exposes `syncCatalogToConfigs()` — the TUI-independent core (fetch → diff → probe once → apply/prune/write) shared by the TUI command and `scripts/setup.ts`; takes `confirmProbe`/`onProgress` hooks so callers supply their own dialog/toast/console. |
| `packages/opencode/src/cli/cmd/tui/util/gwdg-refresh-command.ts` | The `/models-refresh` TUI command handler (kept out of `app.tsx` on purpose); a thin shell over `syncCatalogToConfigs()` — confirm dialog, progress toasts, SIGUSR2 reload |
| `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/rate-limit.tsx` | The "Rate limit" sidebar section + its slot registration |

## Modified upstream files (the merge-conflict surface)

Paths relative to `packages/opencode/src/` unless noted. Two features force us to touch upstream source; everything else is branding or build glue.

### Feature: GWDG rate-limit display & retry backoff

Surfaces GWDG's `x-ratelimit-*` response headers in the TUI sidebar and uses them to time retry backoff.

| File | Our addition |
|---|---|
| `session/llm.ts` | A `wrapStream` middleware that copies `x-ratelimit-*` / `ratelimit-*` response headers into the finish-step `providerMetadata.ratelimit.headers`. Provider-agnostic — works for any OpenAI-compatible endpoint. |
| `session/processor.ts` | `extractRateLimit()` parses those headers onto the assistant message (+ a 4-line hook in the finish handler) |
| `session/message-v2.ts` | Optional `rateLimit` field on the Assistant message schema |
| `session/retry.ts` | Uses the headers to estimate backoff wait time on 429s |
| `cli/cmd/tui/feature-plugins/sidebar/context.tsx` | **2 lines**: import + `registerRateLimitSlot(api)`. The actual view lives in `sidebar/rate-limit.tsx` (ours). |

### Feature: `/models-refresh` command

| File | Our addition |
|---|---|
| `cli/cmd/tui/app.tsx` | **1 line** in the command list: `GwdgRefreshCommand.command({ dialog, toast, project })`, plus the `useProject` import/call it needs. Handler and logic live in `util/gwdg-refresh-command.ts` / `util/gwdg-refresh.ts` (ours). |

### Branding

| File | Our addition |
|---|---|
| `cli/logo.ts` | Splash ASCII art redrawn as "iibcode" |
| `cli/cmd/tui/app.tsx` | 4 terminal-title lines use `BRAND.name` / `BRAND.short` from `cli/brand.ts` (ours) instead of the "OpenCode" literals |

### Build & repo glue

| File | Our addition |
|---|---|
| `package.json` (repo root) | 3 scripts: `setup`, `iibcode:build`, `setup:global-config` |
| `.gitignore` (repo root) | Un-ignores `opencode.json` (we own it); ignores `.claude/settings.local.json` |

## Deliberately NOT modified

- `packages/opencode/src/provider/sdk/copilot/**` — an earlier revision captured rate-limit headers here; superseded by the provider-agnostic `session/llm.ts` middleware and reverted to shrink the merge surface.
- `packages/opencode/package.json` — the binary rename to `iibcode` happens in `scripts/build-iibcode.ts`, not via `pkg.name`.
- `bun.lock` — local builds dirty it with line-ending noise; reset it before committing (`git checkout -- bun.lock packages/opencode/package.json`).

## Keeping this list honest

After each upstream sync (see [maintainer-sync.md](maintainer-sync.md)), re-run the ground-truth diff above. If a file shows up that isn't in this document, either revert it or document it here.
