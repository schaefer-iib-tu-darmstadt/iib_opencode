# IIB Agent CLI — fork of [sst/opencode](https://github.com/sst/opencode)

A personal fork of OpenCode wired up to use the **GWDG Chat AI** and **TUDaGPT** university LLM gateways with open-weight models (Qwen3-Coder, Devstral, GLM, Mistral Large, etc.) instead of frontier closed models.

The idea: Claude Code-style interactive coding agent, but powered by models hosted on TU/GWDG infrastructure, fully open-source, no external API costs.

## What's customized

| | |
|---|---|
| `opencode.json` | Adds the `gwdg` provider (and later `tudagpt`) using `@ai-sdk/openai-compatible` |
| `FORK.md`, `CLAUDE.md` | Fork-specific docs (this file + Claude Code context) |
| Everything else | Untouched upstream — pulls cleanly from `sst/opencode` |

## Quick start

### Prerequisites

- **Bun** ≥ 1.3 — `irm https://bun.com/install.ps1 | iex` (Windows) or see [bun.sh](https://bun.sh)
- **Git**
- A **GWDG API key** — book one at the [KISSKI LLM Service page](https://kisski.gwdg.de/leistungen/2-02-llm-service/)
- (optional) A **TUDaGPT API key** from TU Darmstadt HRZ — only works on the TU network

### Setup

```powershell
git clone <this-repo>
cd iib_agent_cli_claude
bun install --ignore-scripts   # see "Known issues" below for why --ignore-scripts
[Environment]::SetEnvironmentVariable("GWDG_API_KEY", "your-key-here", "User")
# open a fresh shell so the env var is picked up
```

### Verify it works

```powershell
bun dev models gwdg              # lists configured GWDG models
bun dev run --dir . "Reply with the single word PONG" -m gwdg/qwen3-coder-30b-a3b-instruct
```

### Run the interactive TUI

```powershell
bun dev                          # launches OpenCode TUI in current dir
```

For daily use, building a binary (`cd packages/opencode && bun run build`) and adding it to PATH is more ergonomic.

## Available models

Configured in [`opencode.json`](opencode.json). Currently exposed via the `gwdg/` provider prefix:

- `qwen3-coder-30b-a3b-instruct` — recommended default for coding tasks
- `qwen3.5-397b-a17b` — flagship Qwen for harder problems
- `devstral-2-123b-instruct-2512` — Mistral's coding-tuned model
- `mistral-large-3-675b-instruct-2512` — flagship Mistral
- `glm-4.7` — strong on agentic tasks
- `openai-gpt-oss-120b` — OpenAI's open weights
- `qwen3.5-122b-a10b`, `qwen3-30b-a3b-instruct-2507`, `llama-3.3-70b-instruct`, `deepseek-r1-distill-llama-70b`

Full GWDG catalog: `POST https://chat-ai.academiccloud.de/v1/models` with `Authorization: Bearer $GWDG_API_KEY`.

## Pulling upstream updates

The fork is set up so `git pull` from `sst/opencode` never conflicts with our customizations.

```bash
git fetch upstream
git merge upstream/dev          # or rebase, your call
```

If you've created your own GitHub fork and want to push:

```bash
git remote add origin https://github.com/<you>/opencode.git
git push -u origin dev
```

## Known issues

### `bun install` fails on Windows without Visual Studio

`tree-sitter-powershell` needs node-gyp + a C++ compiler. Workaround: install with `--ignore-scripts`. Loses PowerShell syntax highlighting in the TUI; nothing else.

### `bun dev` thinks the project root is `packages/opencode`

The `dev` script in root `package.json` has `--cwd packages/opencode`. So when you run `bun dev run "..."`, OpenCode treats that subdirectory as the project. Workaround: pass `--dir <project-path>` to the `run` subcommand. The interactive TUI (`bun dev` with no args) inherits the same wrong cwd; for real use, build the binary and run from the actual project directory.

## License

OpenCode is MIT-licensed. This fork remains MIT.
