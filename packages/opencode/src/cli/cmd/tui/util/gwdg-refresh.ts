import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"

const GWDG_BASE_URL = "https://chat-ai.academiccloud.de/v1"

// KISSKI Basic tier = 15 req/min => one request every 4s; +100ms safety.
const PROBE_GAP_MS = 4100
const PROBE_TIMEOUT_MS = 90_000
const CATALOG_TIMEOUT_MS = 30_000

const DEFAULT_CONTEXT = 128_000
const DEFAULT_OUTPUT = 8192

// GWDG publishes per-model context windows only in its HTML docs — the /v1/models
// API omits them — so we scrape this page's "Context window in tokens" column.
const GWDG_DOCS_URL = "https://docs.hpc.gwdg.de/services/ai-services/chat-ai/models/index.html"

export type CatalogModel = {
  id: string
  name?: string
  status?: string
  input?: string[]
  output?: string[]
}

export type Catalog = { data: CatalogModel[] }

export type ProbeResult =
  | { ok: true; supported: boolean }
  | { ok: false; error: string; brokenHint?: string }

export type ConfigModelEntry = {
  name: string
  tool_call: boolean
  reasoning?: boolean
  attachment?: boolean
  limit: { context: number; output: number }
}

export type CategoryTag = "thinking" | "coding" | "vision"

export class GwdgRefreshError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message)
    this.name = "GwdgRefreshError"
  }
}

export function getApiKey(): string {
  const key = process.env.GWDG_API_KEY
  if (!key) {
    throw new GwdgRefreshError(
      "GWDG_API_KEY is not set",
      "Set it as a User-scope env var on Windows, then restart the TUI.",
    )
  }
  return key
}

export async function fetchCatalog(apiKey: string): Promise<Catalog> {
  const res = await fetch(`${GWDG_BASE_URL}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new GwdgRefreshError(
      `GWDG /v1/models returned ${res.status}`,
      body.slice(0, 200) || res.statusText,
    )
  }
  return (await res.json()) as Catalog
}

// Tool-call support is a *server* property and GWDG signals it deterministically:
// a deployment without a tool parser rejects the request with an HTTP 4xx
// ("enable-auto-tool-choice"), while a tool-capable one returns 2xx — whether or
// not the model chooses to call on that particular turn. Whether the model
// actually emits a tool_call is noisy (even qwen3.6-35b answers some probes in
// prose, and GWDG throws intermittent 500s), so we must NOT gate on it — doing so
// false-negatives good models. We classify purely on HTTP status: 4xx =>
// unsupported, 2xx => supported, retrying transient 5xx / network up to a budget.
const TOOL_PROBE_MAX_CALLS = 4
const TOOL_PROBE_RETRY_GAP_MS = 1100

type ProbeOnce =
  | { kind: "accepted" } // 2xx — deployment accepts tool calls
  | { kind: "server-reject" } // 4xx — deployment has no tool support
  | { kind: "transient"; error: string } // 5xx / network — retry

async function probeToolCallOnce(modelId: string, apiKey: string): Promise<ProbeOnce> {
  const body = JSON.stringify({
    model: modelId,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant. When asked about weather, you MUST call get_weather. Do not answer in prose.",
      },
      { role: "user", content: "What is the weather in Berlin?" },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get the current weather for a city",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      },
    ],
    tool_choice: "auto",
    stream: false,
    max_tokens: 200,
    temperature: 0.0,
  })

  let res: Response
  try {
    res = await fetch(`${GWDG_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch (e) {
    return { kind: "transient", error: e instanceof Error ? e.message : String(e) }
  }

  // Drain the body so the socket can be reused; its content is irrelevant — the
  // HTTP status alone says whether the deployment accepts tools.
  await res.text().catch(() => "")
  if (res.ok) return { kind: "accepted" }
  // 5xx (server blip) and 429/408 (rate limit / request timeout) are transient —
  // retry, never let them mislabel a tool-capable model as unsupported. Other 4xx
  // (esp. the enable-auto-tool-choice 400) mean the deployment truly has no tool
  // support — definitive.
  if (res.status >= 500 || res.status === 429 || res.status === 408) {
    return { kind: "transient", error: `HTTP ${res.status}` }
  }
  return { kind: "server-reject" }
}

export async function probeToolCall(modelId: string, apiKey: string): Promise<ProbeResult> {
  let calls = 0
  let lastTransient: string | undefined
  while (calls < TOOL_PROBE_MAX_CALLS) {
    if (calls > 0) await sleep(TOOL_PROBE_RETRY_GAP_MS)
    calls++
    const r = await probeToolCallOnce(modelId, apiKey)
    if (r.kind === "accepted") return { ok: true, supported: true }
    if (r.kind === "server-reject") return { ok: true, supported: false }
    lastTransient = r.error
  }
  // Only transient failures within the budget — inconclusive this run.
  return { ok: false, error: lastTransient ?? "probe inconclusive after retries" }
}

export function categorize(model: CatalogModel): CategoryTag[] {
  const tags: CategoryTag[] = []
  const id = model.id.toLowerCase()
  const isThinking =
    (model.output ?? []).includes("thought") || /thinking|qwq|deepseek-r1/.test(id)
  const isCoding = /coder|codestral|devstral/.test(id)
  const isVision =
    (model.input ?? []).includes("image") ||
    /vision|-vl-|^omni|-omni|internvl|gemma|qwen2?-?vl/.test(id)
  if (isThinking) tags.push("thinking")
  if (isCoding) tags.push("coding")
  if (isVision) tags.push("vision")
  return tags
}

export async function findOpencodeJson(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir)
  while (true) {
    const candidate = path.join(dir, "opencode.json")
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile()) return candidate
    } catch {}
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

// The user-level opencode config, used when there's no project-local opencode.json
// (e.g. iibcode launched from an unrelated directory). Path mirrors
// install-global-config.ts and @opencode-ai/core/global: $XDG_CONFIG_HOME/opencode,
// defaulting to ~/.config/opencode on every platform, including Windows.
export function globalConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(xdgConfigHome, "opencode", "opencode.json")
}

export type ConfigTarget =
  | { path: string }
  | { path: null; projectDir: string; globalPath: string }

// Locate the opencode.json that /models-refresh should edit: prefer a project-local
// one (walking up from startDir), otherwise fall back to the global user config —
// the config actually in effect when iibcode runs outside the repo. Returns the
// resolved path, or where we looked so the caller can report both locations.
export async function resolveConfigPath(startDir: string): Promise<ConfigTarget> {
  const local = await findOpencodeJson(startDir)
  if (local) return { path: local }
  const globalPath = globalConfigPath()
  try {
    const stat = await fs.stat(globalPath)
    if (stat.isFile()) return { path: globalPath }
  } catch {}
  return { path: null, projectDir: startDir, globalPath }
}

export type ConfigTargets = { paths: string[]; projectDir: string; globalPath: string }

// Like resolveConfigPath, but returns EVERY opencode.json /models-refresh should
// sync — the nearest project-local one (if any) AND the global user config (if it
// exists) — deduplicated. /models-refresh is a plain "mirror the current GWDG
// catalog" action, so it should keep both configs in sync rather than editing
// only whichever one happens to be in effect. `paths` is empty when neither
// exists; `projectDir`/`globalPath` are returned so the caller can report where
// it looked.
export async function resolveConfigTargets(startDir: string): Promise<ConfigTargets> {
  const globalPath = globalConfigPath()
  const paths: string[] = []

  const local = await findOpencodeJson(startDir)
  if (local) paths.push(path.resolve(local))

  try {
    const stat = await fs.stat(globalPath)
    if (stat.isFile()) {
      const resolved = path.resolve(globalPath)
      if (!paths.includes(resolved)) paths.push(resolved)
    }
  } catch {}

  return { paths, projectDir: startDir, globalPath }
}

export async function readConfig(filepath: string): Promise<Record<string, unknown>> {
  const text = await fs.readFile(filepath, "utf8")
  return JSON.parse(text) as Record<string, unknown>
}

export async function writeConfig(filepath: string, config: unknown): Promise<void> {
  const text = JSON.stringify(config, null, 2) + "\n"
  await fs.writeFile(filepath, text, "utf8")
}

export function buildEntry(
  model: CatalogModel,
  probe: ProbeResult,
  limits: ContextLimit[] = [],
): { entry: ConfigModelEntry; tags: CategoryTag[] } {
  const tags = categorize(model)
  const supported = probe.ok && probe.supported
  const hints: string[] = []
  if (!supported) {
    if (!probe.ok && probe.brokenHint) hints.push(probe.brokenHint)
    else hints.push("no tools")
  }
  if (tags.includes("thinking")) hints.push("thinking")

  let displayName = model.name ?? model.id
  if (hints.length > 0) displayName = `${displayName} (${hints.join("; ")})`

  const entry: ConfigModelEntry = {
    name: displayName,
    tool_call: supported,
    limit: { context: resolveContextLimit(model, limits) ?? DEFAULT_CONTEXT, output: DEFAULT_OUTPUT },
  }
  if (tags.includes("thinking")) entry.reasoning = true
  if (tags.includes("vision")) entry.attachment = true
  return { entry, tags }
}

// A scraped docs row: the model name split into comparable tokens + its context window.
export type ContextLimit = { tokens: string[]; context: number }

// Split a model name/id into lowercase alphanumeric tokens ("GLM-4.7" -> ["glm","4","7"],
// "meta-llama-3.1-8b-instruct" -> ["meta","llama","3","1","8b","instruct"]).
function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

// Parse a context-window cell like "256K", "65k", "1M", "131072", "65,536".
export function parseContextSize(text: string): number | null {
  const t = text.replace(/,/g, "").toLowerCase().trim()
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([km])?$/)
  if (!m) return null
  const n = Number.parseFloat(m[1])
  if (m[2] === "m") return Math.round(n * 1_000_000)
  if (m[2] === "k") return Math.round(n * 1_000)
  return Math.round(n)
}

// Scrape the GWDG docs table into a list of { tokens, context } rows.
// Best-effort: any failure (offline, layout change) yields [] so the caller
// falls back to defaults / existing limits rather than aborting the refresh.
export async function fetchContextLimits(): Promise<ContextLimit[]> {
  let html: string
  try {
    const res = await fetch(GWDG_DOCS_URL, { signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) })
    if (!res.ok) return []
    html = await res.text()
  } catch {
    return []
  }

  const limits: ContextLimit[] = []
  const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => m[1])
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((c) => c[1])
    if (cells.length < 5) continue
    // Column layout: Organization | Model | Open | Release date | Context window | ...
    const name = cells[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    const context = parseContextSize(cells[4].replace(/<[^>]+>/g, " ").trim())
    if (name && context != null) limits.push({ tokens: tokenize(name), context })
  }
  return limits
}

// Match a catalog model to a scraped docs row and return its context window.
// Tries the model's display name then its id, first as an exact token-set match,
// then as a subset (docs tokens all present in the model — handles "Meta"/"OpenAI"
// prefixes and extra words), preferring the most specific (longest) docs row.
export function resolveContextLimit(model: CatalogModel, limits: ContextLimit[]): number | undefined {
  const candidates = [model.name, model.id].filter((v): v is string => !!v).map(tokenize)
  for (const cand of candidates) {
    const set = new Set(cand)
    const exact = limits.find((l) => new Set(l.tokens).size === set.size && l.tokens.every((t) => set.has(t)))
    if (exact) return exact.context
  }
  let best: ContextLimit | undefined
  for (const cand of candidates) {
    const set = new Set(cand)
    for (const l of limits) {
      if (l.tokens.length >= 2 && l.tokens.every((t) => set.has(t))) {
        if (!best || l.tokens.length > best.tokens.length) best = l
      }
    }
    if (best) return best.context
  }
  return undefined
}

// Update context limits on models already in the config from the scraped rows.
// Mutates `models` in place; returns the ids whose context actually changed.
export function applyContextLimits(
  models: Record<string, { limit?: { context?: number; output?: number } }>,
  catalog: Catalog,
  limits: ContextLimit[],
): { updated: string[] } {
  const updated: string[] = []
  for (const [id, entry] of Object.entries(models)) {
    const model = catalog.data.find((m) => m.id === id) ?? { id }
    const context = resolveContextLimit(model, limits)
    if (context == null) continue
    if (!entry.limit) {
      entry.limit = { context, output: DEFAULT_OUTPUT }
    } else if (entry.limit.context !== context) {
      entry.limit.context = context
    } else {
      continue
    }
    updated.push(id)
  }
  return { updated }
}

export function diffCatalog(
  existing: Record<string, unknown>,
  catalog: Catalog,
): { newIds: string[]; staleIds: string[]; readyCount: number } {
  const ready = catalog.data.filter((m) => (m.status ?? "ready") === "ready")
  const catalogIds = new Set(ready.map((m) => m.id))
  const existingIds = new Set(Object.keys(existing))

  const newIds = [...catalogIds].filter((id) => !existingIds.has(id)).sort()
  const staleIds = [...existingIds].filter((id) => !catalogIds.has(id)).sort()

  return { newIds, staleIds, readyCount: ready.length }
}

// Delete every stale model id (in the config but no longer in the ready catalog)
// from `models`, mutating it in place. Returns the ids actually removed. `protect`
// (the config's top-level default model id) is never removed: pruning the active
// default would leave `model` pointing at a missing entry and break TUI startup —
// so it's skipped here and reported by the caller instead. This is what makes
// /models-refresh a true sync: models GWDG has decommissioned drop out of
// opencode.json automatically rather than lingering as stale entries.
export function pruneStale(
  models: Record<string, unknown>,
  staleIds: string[],
  protect?: string,
): { removed: string[]; protectedStale: string[] } {
  const removed: string[] = []
  const protectedStale: string[] = []
  for (const id of staleIds) {
    if (!(id in models)) continue
    if (protect && id === protect) {
      protectedStale.push(id)
      continue
    }
    delete models[id]
    removed.push(id)
  }
  return { removed, protectedStale }
}

export type KeyCheck = {
  valid: boolean
  status?: number
  reason: "ok" | "unauthorized" | "network" | "server"
}

// Lightweight GWDG API-key check for onboarding: GET /v1/models with the key and
// classify the outcome instead of throwing (unlike fetchCatalog), so setup.ts can
// drive a "retry until valid" prompt loop. 2xx => ok; 401/403 => the key is wrong;
// any other HTTP status => server-side issue; a network/timeout exception =>
// unreachable (GWDG down / offline).
export async function validateApiKey(apiKey: string): Promise<KeyCheck> {
  try {
    const res = await fetch(`${GWDG_BASE_URL}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    })
    if (res.ok) return { valid: true, status: res.status, reason: "ok" }
    if (res.status === 401 || res.status === 403) return { valid: false, status: res.status, reason: "unauthorized" }
    return { valid: false, status: res.status, reason: "server" }
  } catch {
    return { valid: false, reason: "network" }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const constants = {
  PROBE_GAP_MS,
}
