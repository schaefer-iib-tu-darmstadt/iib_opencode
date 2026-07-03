# iibcode - Übersicht und Architektur

**iibcode** ist ein Open-Source Coding Agent, der auf Open-Weight-LLM-Modellen läuft, ausschließlich auf akademischer Infrastruktur (GWDG/TUDaGPT). Es ist ein Fork von [anomalyco/opencode](https://github.com/anomalyco/opencode) mit spezifisch für deutschen Hochschulkontext angepasster Konfiguration und Tool-Support.

## Kernmerkmale

- **Lokale Hochschul-Infrastruktur:** Alle Daten (Prompts, Code, Gespräche) bleiben auf GWDG/TUDaGPT-Servern – kein Datenabfluss zu Anthropic/OpenAI
- **Kostenlose Nutzung:** Kein Token-Billing, abgedeckt durch institutional access (KISSKI/TU)
- **Tool-Use-Agent:** 15+ Werkzeuge (File ops, Shell, Glob, Grep, Git, Edit, Web Fetch) im Claude Code/Codex/Aider Stil
- **Modern Tech Stack:** TypeScript, Bun (≥1.3), Effect v4, Drizzle ORM, Pseudo-Terminal
- **Einfache Provider-Hooking:** Einfach neue OpenAI-kompatible Provider via `opencode.json` hinzufügen

## Repository-Struktur

Das Repository ist als Monorepo mit Paketen organisiert:

### Packages

| Package | Zweck |
|---------|-------|
| `opencode` | CLI-TUI (OpenCode Core) – Kommandozeilen-Tool-Kern |
| `desktop` | Electron Desktop App |
| `app` | Next.js Web Interface |
| `console` | Console-Rider Kompatibilität |
| `enterprise` | Team Features (Multi-User) |
| `extensions` | Integrationen (GitHub Copilot etc.) |
| `identity` | Auth/Account Management |
| `sync` | Session Sync |
| `share` | Session Sharing |
| `plugin` | Plugin System |
| `function` | User Functions |
| `server` | Lokaler HTTP-Server für Browser IDE |
| `ui` | Frontend UI-Komponenten |
| `web` | Web-spezifische UI-Komponenten |
| `storybook` | Component Storybook |
| `containers` | Docker/Container Support |
| `sdk` | TypeScript/Python etc. SDKs |
| `slack` | Slack Integration |
| `core` | Kreuzpaket-Kernfunktionen |

### Core Modules (in `packages/opencode/src/`)

1. **Session & Agent** (`session/`, `agent/`) – LLM-Session-Management mit Tool-Registry, Message Handling, Prompt Templates
2. **Tools** (`tool/`) – File ops (`read.ts`, `write.ts`, `edit.ts`), Search (`glob.ts`, `grep.ts`), Shell (`shell.ts`), Git (`git/`), LSP (`lsp/`), Question/Ask (`question.ts`), Task/Codex (`task.ts`), Web Search/Fetch (`websearch.ts`, `webfetch.ts`)
3. **Provider** (`provider/`) – Abstraktion für LLM Providers (OpenAI, Anthropic, Custom), unterstützt 13+ GWDG-Modelle
4. **Config & CLI** (`config/`, `cli/`) – User Config Parsing, Command-Line Interface (TUI + One-Shot Run)
5. **File System** (`file/`) – FS-Wrapper mit ignore patterns, ripgrep integration
6. **PTY** (`pty/`) – Terminal emulation mit node-pty backend
7. **Server** (`server/`) – Lokaler HTTP-API server für Kompatibilität mit Browser IDE
8. **Storage** (`storage/`) – SQLite backend (bun/node)
9. **Control Plane** (`control-plane/`) – Workspace Management

### Provider-Konfiguration

Die iibcode-spezifischen Modifikationen (`opencode.json`):

- `enabled_providers: ["gwdg"]` – Beschränkung auf akademische Provider, versteckt opencode.ai free models
- `gwdg/` provider mit 13 tool-capable Modellen (Qwen, Devstral, GLM, Mistral, Llama etc.)
- Per-Model limits (`context`, `output`) und capabilities (`tool_call`, `attachment`, `reasoning`)

## Build & Deployment

- Binary Größe: ~150 MB (Windows, macOS, Linux)
- Build-Kommando: `bun run iibcode:build` → `dist/iibcode.exe`
- Paketmanager: `bun` (mit workspace support via `workspaces` field)
- Linting: `oxlint` als TypeScript linter
- Type checking: `bun turbo typecheck` (Monorepo-spezifisch)

## Wichtigste Services und Funktionen

- **CLI Entry Point:** `iibcode` (binary) vs `bun run dev` (entwicklung)
- **TUI Main Loop:** `packages/opencode/src/index.ts`
- **Tool Registry:** `packages/opencode/src/tool/registry.ts`
- **Provider Init:** `packages/opencode/src/provider/provider.ts`
- **LLM Call:** `packages/opencode/src/session/llm.ts`
- **File Ops:** `packages/opencode/src/tool/*.ts`
- **Config Parsing:** `packages/opencode/src/config/config.ts`
- **Binary Build:** `scripts/build-iibcode.ts`

## Architektur-Details

### Provider-Hochlauf

`provider/provider.ts` initialisiert alle enabled providers mit respektive SDKs (z.B. `@ai-sdk/openai-compatible` für GWDG).

### Tool-Aufruf-Workflow

1. `tool/registry.ts` registriert alle Tools
2. LLM entscheidet welches Tool nutzen
3. `tool/*.ts` implementiert Schema und ausgeführte Logik

### Session-Management

`session/session.ts` maintains komplette Konversationshistorie mit projected prompt (inkl. File contents) für LLM calls.

### Modell-Auswahl

Im TUI via `/models` command auswählbar; Default-Modell ist `gwdg/qwen3-coder-30b-a3b-instruct`.

## Upstream-Beziehung

- Fork von `anomalyco/opencode` (ein unabhängiges Open-Source-Projekt, kein Anthropic-Produkt)
- Nutzt den Git-`merge=ours`-Driver für `README.md`, `docs/*.md`, `docs/upstream-readme/` und `docs/images/` → iibcode-Doku bleibt bei Upstream-Merges intakt
- Upstream-Sync-Prozess in `docs/maintainer-sync.md` dokumentiert

### Modifikationen (vs upstream)

Die vollständige, kanonische Liste steht in **`docs/fork-changes.md`**. Kurzfassung:

- `opencode.json` – Vollständige Hochschul-Provider-Konfiguration (GWDG, 21 Modelle)
- **Rate-Limit-Feature** – `session/{llm,processor,message-v2,retry}.ts` (additive Blöcke) + `sidebar/rate-limit.tsx` (eigene Datei): GWDG-`x-ratelimit-*`-Header in der TUI-Sidebar + Retry-Backoff
- **`/models-refresh`** – `util/gwdg-refresh.ts` + `util/gwdg-refresh-command.ts` (eigene Dateien, 1-Zeilen-Hook in `app.tsx`): Modell-Liste + Context-Limits von GWDG holen und in `opencode.json` schreiben
- **Branding** – `cli/brand.ts` + Splash-Logo (`cli/logo.ts`) + Terminal-Titel
- `scripts/setup.ts`, `scripts/build-iibcode.ts`, `scripts/install-global-config.ts` – Onboarding/Build/Setup
- `.gitattributes` – `merge=ours`-Markierungen für die Fork-Doku
- `CLAUDE.md`, `docs/` – Agent-Kontext + iibcode-spezifische Dokumentation

## Dokumentationsstruktur

| Bereich | Datei | Beschreibung |
|---------|-------|--------------|
| **Nutzer** | `README.md` | Setup (Bun, API key), Build, Usage, Modell-Empfehlungen |
| **Fork-Diff** | `docs/fork-changes.md` | Kanonische Liste aller Abweichungen von upstream |
| **Releases** | `docs/release.md` | Windows-Binary-Release-Prozess (aktuell Windows-only) |
| **Modelle** | `docs/models.md` | Vollständige Modell-Liste mit capabilities |
| **Troubleshooting** | `docs/troubleshooting.md` | Windows symlink trap, `bun install` quirks |
| **Development** | `docs/development.md` | `bun dev`, was ist customisiert in diesem Fork |
| **Upstream Sync** | `docs/maintainer-sync.md` | Merging von anomalyco/opencode |
| **GitHub** | `.github/` | Auto-build workflows |
| **Upstream README** | `docs/upstream-readme/` | Archivierte OpenCode READMEs |

## Roadmap 2026

### Q2 2026

- TUDaGPT als zweiten Provider
- Per-Model `limit` tunen
- Automatisches weekly Refresh für Modells

### Q3 2026

- Eval-Suite gegen alle Modelle
- Conversation Export (JSON + MD)
- Datenschutz-Primer
- Auto-Failover (Provider-Fallback)

### Q4 2026 / Langfristig

- Self-hosted Provider (Ollama/vLLM)
- VS Code Extension
- Universidad-Mode für Lehre

## Besondere Dateien

- `install` – Upstreams Install-Script für offizielle opencode-Releases (gilt **nicht** für iibcode — Setup siehe README)
- Kein `.env.local` für Secrets! Nutze `opencode.json` mit `{env:GWDG_API_KEY}`
- Windows Symlink Bug Fix: `bun run --cwd packages/opencode fix-node-pty`

## CI/CD Features

- **Keine eigene CI aktiv.** Die `.github/workflows/` im Repo sind Upstreams Pipelines (laufen nur auf GitHub, nicht auf dem RWTH GitLab). Releases entstehen aktuell manuell — Prozess und CI-Aktivierungsplan in `docs/release.md`.
- **Nix flakes** (`flake.nix`, `.nix/`) für reproducible local development (upstream)
- **Turbo** (`turbo.json`) für Monorepo package cache (upstream)

## Alternativen

- **Claude Code** (Anthropic Closed) – Ähnliche UX, aber API-Kosten erforderlich
- **Aider** – Python-basierte Coding Assistants; weniger capabilities als iibcode
- **Continue.dev** – Code LSP Integration; kleineres Tool-Set

## Technologie-Stack

- **Sprache:** TypeScript (pure ESM)
- **Runtime:** Bun (≥1.3)
- **FFI:** `node-pty` (Node-based PTY emulation)
- **Model SDK:** `@ai-sdk/openai`, `@ai-sdk/openai-compatible`
- **Effect System:** Effect v4 (beta 4.0.0-beta.x)
- **ORM:** Drizzle v1.0.0-beta19
- **Config:** JSON mit variablen interpolation
- **UI:** (Desktop) Electron SolidStart, (Web) Next.js, (Terminal) OpenTUI (Vite-based)
- **Build:** `bun build` (via `scripts/build-iibcode.ts`)

## Empfohlene Modelle für Agentives Coding

| Modell | Am besten für |
|--------|---------------|
| `qwen3-coder-30b-a3b-instruct` | Tägliche Coding-Arbeit, schnelle Iteration – **iibcode Default** |
| `devstral-2-123b-instruct-2512` | Schwerere Coding / Refactors – Mistrals coding-tuned Modell |
| `glm-4.7` | Multilinguale Agentive Flows – GWDGs coding-markierte Empfehlung |
| `qwen3.5-397b-a17b` | Komplexe Reasoning + Coding – Qwen Flagship mit Thinking |
| `mistral-large-3-675b-instruct-2512` | Maximale Capability – Mistral Flagship, general-purpose |

---

**Zusammenfassung:** iibcode ist ein Open-Source Coding Agent für deutschen Hochschulkontext. Es bietet eine Claude-Code-ähnliche Agentic-Coding-UX auf 100% akademischer Infrastruktur (GWDG/TUDaGPT) ohne API-Kosten, mit 13 tool-fähigen Open-Weight-Modellen. CLI ist mit `bun run iibcode:build` baubar, default-Modell `gwdg/qwen3-coder-30b-a3b-instruct`. Repository tree ist sauber organisierter Monorepo mit 18 packages; `packages/opencode` ist der Kern für TUI, tools, providers, sessions. Config in `opencode.json` ist erweiterbar mit einem einfachen Add-new-Provider-Workflow.
