# iibcode

An open-source coding agent that runs on open-weight foundation models provided by **GWDG ChatAI** or **TUDaGPT**. Claude Code / Codex / Aider-style interactive TUI — free for academic use, prompts and code stay on university infrastructure. Personal/experimental fork of [opencode](https://github.com/anomalyco/opencode); model list and config will drift, breaking changes likely.

<p align="center">
  <img src="docs/images/iibcode.png" width="800" alt="iibcode TUI running against the GWDG API">
</p>

## Features

- 🔒 **Data stays on university infrastructure** — prompts, code, and conversations go to GWDG or TUDaGPT, not to closed-API providers.
- 🆓 **Free for academic users** — covered by KISSKI / TU institutional access; no per-token billing or external contracts.
- 🧠 **13 tool-capable open-weight models** — coding, reasoning, and agentic flagships (see [Recommended models](#recommended-models-for-agentic-coding) below).
- 🛠️ **Agentic TUI** — Claude Code / Codex / Aider-style coding assistant with file ops, shell, glob, grep, edit, web fetch.
- 📊 **Live rate-limit display** — your GWDG request budget (req/min, req/hr) in the TUI sidebar, read from the API's `x-ratelimit-*` headers; retries back off using the real numbers.
- 🔁 **`/models-refresh`** — one TUI command re-syncs the model list, tool-call support, and per-model context limits against the live GWDG catalog.
- 🪟 **Single ~150 MB binary, Windows-first** — no Docker, no Python virtualenv. Setup script and docs target Windows + PowerShell; macOS/Linux build from source but are untested.
- 🔄 **Tracks upstream cleanly** — pulls [anomalyco/opencode](https://github.com/anomalyco/opencode) improvements via `merge=ours`; iibcode customizations stay intact.

## Recommended models for agentic coding

<!-- Snapshot from the GWDG ChatAI live API; keep in sync with docs/models.md -->
*Snapshot: July 2026.*

| Model | Best for |
|---|---|
| `qwen3-coder-30b-a3b-instruct` | Daily coding, fast iteration — **iibcode default** (256k context) |
| `devstral-2-123b-instruct-2512` | Heavier coding / refactors — Mistral's coding-tuned model |
| `glm-4.7` | Multilingual agentic flows — GWDG's coding-marketed pick |
| `qwen3.5-397b-a17b` | Complex reasoning + coding — flagship Qwen with thinking |
| `mistral-large-3-675b-instruct-2512` | Maximum capability — Mistral flagship, general-purpose |

GWDG's official *standard recommendation* is `meta-llama-3.1-8b-instruct` for general use; see [GWDG's model overview](https://docs.hpc.gwdg.de/services/ai-services/chat-ai/models/index.html) for their full positioning. 13 tool-capable models in total — full catalog (including 6 listed-but-not-yet-tool-capable) in [docs/models.md](docs/models.md).

## Prerequisites

- **Bun** ≥ 1.3 — `irm https://bun.com/install.ps1 | iex` on Windows, or see [bun.sh](https://bun.sh)
- **Git**
- A **GWDG API key** — request one at the [KISSKI LLM Service page](https://kisski.gwdg.de/leistungen/2-02-llm-service/) (German academic affiliation required; allow ~1 week for approval)
- *(optional)* A **TUDaGPT API key** from TU Darmstadt HRZ — only works on the TU network

## Setup

One command, from inside the freshly-cloned repo:

```powershell
git clone https://git-ce.rwth-aachen.de/tuda-iib/iibai/iibcode.git
cd iibcode
bun run setup
```

`bun run setup` installs dependencies, builds the `iibcode` binary and puts it on your PATH, syncs the provider config globally, and prompts for your GWDG API key. Then **open a new terminal** (so the key is visible) and jump to [Use it](#use-it).

### Where the API key lives

`bun run setup` stores your key as a **user environment variable** named `GWDG_API_KEY`. `opencode.json` references it as `{env:GWDG_API_KEY}` and resolves it at runtime, so the key never lands in a file or a commit. To set it by hand instead of via the script:

- **Windows:** `[Environment]::SetEnvironmentVariable("GWDG_API_KEY", "your-key", "User")`
- **macOS/Linux:** `echo 'export GWDG_API_KEY="your-key"' >> ~/.zshrc`  *(or `~/.bashrc`)*

Either way, open a fresh shell afterwards so the variable is visible.

<details>
<summary><b>What <code>bun run setup</code> does (run these by hand instead)</b></summary>

```powershell
bun install --ignore-scripts                                          # deps (see docs/troubleshooting.md if it errors)
bun run iibcode:build                                                 # → dist/iibcode.exe (~150 MB, 1–3 min)
Copy-Item dist\iibcode.exe "$env:USERPROFILE\.bun\bin\iibcode.exe"    # put it on PATH
bun run setup:global-config                                           # writes ~/.config/opencode/opencode.json
```

(macOS/Linux: `cp dist/iibcode ~/.bun/bin/iibcode`, or `sudo cp dist/iibcode /usr/local/bin/iibcode`.)

**Global config** makes the `gwdg/...` models — and the `enabled_providers` allowlist that hides opencode.ai's free models — visible from any working directory. Re-run `bun run setup:global-config -- --force` after editing the project `opencode.json` to keep the two in sync. Path is `$XDG_CONFIG_HOME/opencode/`, defaulting to `~/.config/opencode/` on every platform (Windows opencode follows XDG, not `%APPDATA%`).

</details>

## Use it

```bash
cd path/to/your/project
iibcode                                                                # interactive TUI
iibcode run "explain the auth flow" -m gwdg/qwen3-coder-30b-a3b-instruct  # one-shot
```

`gwdg/qwen3-coder-30b-a3b-instruct` is the recommended default for coding work. Inside the TUI, `/models` lists all configured GWDG models.

## Roadmap

- **TUDaGPT** as a second provider once the base URL and auth are available
- **Blablador** (Helmholtz AI / FZ Jülich) as a third provider — OpenAI-compatible like GWDG, so config-only
- Trim the default tool set for smaller open-weight models that get confused by 15+ tools
- Qwen-tuned system prompt bound via opencode's agent config

## Documentation

| | |
|---|---|
| [docs/models.md](docs/models.md) | Full list of GWDG models, capabilities, and how to re-probe |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Sophos EPERM workaround, Windows symlink trap, `bun install` quirks |
| [docs/development.md](docs/development.md) | `bun dev`, rebuild flow, what's customized in this fork |
| [docs/architecture.md](docs/architecture.md) | Architecture overview (German) — monorepo layout and how the pieces fit |
| [docs/fork-changes.md](docs/fork-changes.md) | Canonical list of every deviation from upstream opencode |
| [docs/release.md](docs/release.md) | Releasing the Windows binary (Windows-only for now) |
| [docs/maintainer-sync.md](docs/maintainer-sync.md) | Pulling updates from `anomalyco/opencode` upstream |
| [docs/upstream-readme/](docs/upstream-readme/) | Original OpenCode README (English + 21 translations) |

> **Upstream sync** (replaces GitHub's "Sync fork" button):
> ```bash
> git fetch upstream && git merge upstream/dev && git push origin dev
> ```
> See [docs/maintainer-sync.md](docs/maintainer-sync.md) for first-time setup and caveats.

## License

iibcode, a fork of OpenCode, remains MIT-licensed.
