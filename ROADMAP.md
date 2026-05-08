# iibcode roadmap

Living document. Stand: 2026-05-08.

## Vision

iibcode soll eine **Open-Source-Alternative zu Claude Code** sein, die ausschließlich auf **akademischer Infrastruktur** läuft — also Open-Weight-Modelle, gehostet von GWDG (KISSKI/Chat AI) und TUDaGPT (TU Darmstadt HRZ). Kein Datenabfluss zu OpenAI/Anthropic, keine API-Kosten für Studis und Forschende, voller Zugang zum Source.

Konkret:

- Bedienbarkeit auf Claude-Code-Niveau (TUI + Headless-Run + Tool-Use).
- Provider sind austauschbar, aber der Default-Stack ist **TU/GWDG**.
- Updates aus `sst/opencode` werden weiter regelmäßig gemerged — wir bauen *darauf auf*, nicht daneben.

---

## Q2 2026 — Near-term (next ~6 Wochen)

### Provider

- [ ] **TUDaGPT als zweiten Provider verdrahten.** Base-URL und Auth-Modus von HRZ klären (ist es OpenAI-compatible? Shibboleth-Header? Bearer?), Eintrag in `opencode.json` analog zu `gwdg`, Modell-Liste probe-en, `scripts/probe-tudagpt.ts` analog zu `scripts/probe-gwdg.ts`.
- [ ] **Per-Model `limit.context` / `limit.output` kalibrieren.** Aktuell konservativer 128k-Guess für die meisten Modelle. Echte Werte aus `/v1/models` ziehen oder per Modell-Card recherchieren und in `opencode.json` setzen — wirkt sich direkt auf Kontext-Truncation und Kosten/Quota-Verhalten aus.
- [ ] **`bun run gwdg:refresh` periodisch (CI-Cron, wöchentlich) laufen lassen.** Wenn GWDG `--enable-auto-tool-choice` für eines der 8 aktuell nicht-tool-fähigen Modelle einschaltet, soll das automatisch sichtbar werden statt manuell entdeckt.

### CLI / UX

- [ ] **System-Prompt für Qwen3-Coder tunen.** OpenCode bindet Agent-Configs; ein Qwen-spezifischer Prompt (knapper, weniger Gemini/Claude-Phrasing, expliziter zu Tool-Schemas) dürfte messbar weniger Halluzinationen geben. Hook: OpenCode Agent-Config.
- [ ] **Tool-Set für kleinere Modelle trimmen.** OpenCode exposed 15+ Tools; 8B-Modelle wie `meta-llama-3.1-8b-instruct` werden davon überfordert. Ein optionales `--tool-profile minimal|full` Flag, das in `packages/opencode/src/tool/registry.ts` greift.
- [ ] **Numerik-Bug fixen (oder umgehen).** Modelle halluzinieren Counts (Qwen3-Coder: "31" obwohl Glob 41 zurückgibt). Tool-Output-Counts direkt im UI rendern statt das Modell zählen lassen — siehe `CLAUDE.md` Gotcha #2.

### Distribution

- [ ] **CI-Build für `iibcode.exe` / Linux / macOS.** GitHub Actions Workflow, der bei jedem `dev`-Push (oder bei einem Tag) `bun run iibcode:build` für die drei Plattformen fährt und Artefakte als Release anhängt. Aktuell muss jede Person selbst bauen (~3 min, 150 MB Output) — Showstopper für Nicht-Bun-User.
- [ ] **Standalone-Installer-Pfad dokumentieren.** Heute: clone repo, `bun install --ignore-scripts`, build, copy. Ziel: `iwr <release-url> | iex` (Windows) bzw. `curl | sh` (Unix), das das passende Binary holt und auf den PATH legt — analog zu wie Bun selbst sich installiert.

---

## Q3 2026 — Mid-term

### Qualität / Vertrauen

- [ ] **Eval-Suite gegen die GWDG-Modelle.** Set aus 20–30 reproduzierbaren Coding-Tasks (HumanEval-Subset, eigene Tool-Use-Aufgaben gegen ein Test-Repo, Refactor-Cases). Pro Modell + Modell-Version protokollieren. Macht die "welches Modell soll ich nehmen"-Frage datenbasiert beantwortbar und ist Frühwarnsystem, falls ein GWDG-Re-Deploy ein Modell verschlechtert.
- [ ] **Conversations exportierbar.** JSON + Markdown. Wichtig für Reproduzierbarkeit in der Forschung und für Teilen von Coding-Sessions (z.B. in Issues).
- [ ] **DSGVO/Datenschutz-Statement.** Eine Seite in der README oder eigener `PRIVACY.md`: was iibcode lokal speichert (auth.json, History), was an GWDG/TUDaGPT geht, was *nicht* passiert (kein Anthropic, kein OpenAI, keine Telemetrie nach außen). Selling-Point gegenüber Claude Code für TU-Use-Cases.

### Provider-Robustheit

- [ ] **Auto-Failover zwischen Providern.** Wenn GWDG-Quota erreicht oder Modell überlastet (queue: `medgemma`), automatisch das Pendant auf TUDaGPT versuchen. Setzt voraus, dass beide Provider laufen und die Modell-Maps gepflegt sind.
- [ ] **Quota-/Cost-Anzeige.** GWDG hat Token-Quotas pro User. Im TUI eine kleine Anzeige "X von Y Tokens diesen Monat verbraucht" — zieht den Wert aus dem Response-Header oder einem GWDG-Quota-Endpoint (wenn vorhanden, sonst lokal mitzählen).

### Repo-Hygiene

- [ ] **`CONTRIBUTING.md`** schreiben — wie sich Fork zu Upstream verhält, wie ein PR aussehen soll, dass Provider-Änderungen Probes brauchen, dass Source-Edits in `packages/opencode/src/**` Conflict-Risiko bedeuten.
- [ ] **Issue-Templates** (Bug, Modell-Vorschlag, Provider-Vorschlag).
- [ ] **`CHANGELOG.md`** ab dem ersten Release.

---

## Q4 2026 / Long-term — Ideen-Pool

Nicht committed, aber lohnt diskutieren:

- **Self-hosted Provider** — Ollama / vLLM lokal auf einem Studi-Laptop mit GPU als dritter Provider. Sinn: voll-offline, kein API-Key, max. Datensouveränität.
- **VS Code Extension Wrapper.** Existiert für OpenCode bereits in Form? Falls nein: ein dünner Wrapper, der iibcode als Sidebar-Chat in VS Code einbindet, mit GWDG vorkonfiguriert.
- **Akademische Tool-Plugins.** LaTeX-aware Edit (für `.tex` Sources), Jupyter-Notebook-Edit (statt nur Read), R-Skript-Linter. OpenCode hat ein Tool-Registry — das ist der Hook.
- **System-Prompt-Profiles.** Ein Befehl `/profile bachelor-thesis` lädt einen Prompt, der für Schreibarbeit an einer Abschlussarbeit getunt ist (deutsch, akademischer Stil, Zitate). Ähnlich für `code-review`, `debugging`, `data-science`.
- **Lehre-Modus.** Eine TUI-Variante, die Tool-Use sichtbar macht (statt im Hintergrund) — Studis sehen, *wie* das LLM Files sucht und liest. Nützlich für KI-Seminare.
- **Discord/Matrix-Channel** (oder einfach GitHub Discussions zuerst). Erst sinnvoll, wenn ein paar externe User da sind.
- **Mirror-Modelle dokumentieren.** Welches GWDG-Modell entspricht welchem Claude/GPT-Tier? Tabelle: "Wenn du Claude Sonnet 4.6 gewohnt bist, probier Mistral-Large-3" o.ä.

---

## Wartung — laufend

- Wöchentlich `git fetch upstream && git merge upstream/dev`. Konflikte sollten dank `merge=ours` Driver auf README + `docs/upstream-readme/` minimal sein.
- Nach Upstream-Merges: prüfen, ob neue Translations als Top-Level `README.<lang>.md` reingerutscht sind (siehe `CLAUDE.md` Gotcha #5) und nach `docs/upstream-readme/` verschieben.
- Nach jedem GWDG-Re-Deploy (kommunizieren die das überhaupt? — sonst monatlich blind): `bun run gwdg:refresh`.

---

## Nicht-Ziele

Bewusst raus aus dem Scope, damit die Roadmap fokussiert bleibt:

- **Closed-Frontier-Modelle als Default-Provider.** Anthropic/OpenAI direkt einbinden geht technisch trivial via `@ai-sdk/openai` — machen wir nicht, weil es das Alleinstellungsmerkmal "TU/GWDG-only, Datensouveränität" verwässert. Wer Claude direkt will, nimmt Claude Code.
- **Eigenes Modell-Hosting.** Wir betreiben keine GPUs. Provider machen das.
- **Voll-divergierender Fork.** Wenn ein Feature in `sst/opencode` upstream Sinn ergibt (z.B. neuer Provider-Typ), upstream einreichen statt hier abweichen. Ziel ist Merge-Friction so klein wie möglich zu halten.
