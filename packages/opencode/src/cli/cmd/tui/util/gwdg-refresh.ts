import { promises as fs } from "node:fs"
import path from "node:path"

const GWDG_BASE_URL = "https://chat-ai.academiccloud.de/v1"

// KISSKI Basic tier = 15 req/min => one request every 4s; +100ms safety.
const PROBE_GAP_MS = 4100
const PROBE_TIMEOUT_MS = 90_000
const CATALOG_TIMEOUT_MS = 30_000

const DEFAULT_CONTEXT = 128_000
const DEFAULT_OUTPUT = 8192

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

export async function probeToolCall(modelId: string, apiKey: string): Promise<ProbeResult> {
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
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const error = `HTTP ${res.status}: ${text.slice(0, 200)}`
    const brokenHint = /enable-auto-tool-choice/.test(text) ? "no tool calling on GWDG" : undefined
    return { ok: false, error, brokenHint }
  }

  const json = (await res.json().catch(() => null)) as
    | {
        choices?: Array<{
          message?: { tool_calls?: unknown[] }
          finish_reason?: string
        }>
      }
    | null
  const choice = json?.choices?.[0]
  const toolCalls = choice?.message?.tool_calls
  const supported =
    Array.isArray(toolCalls) && toolCalls.length > 0 && choice?.finish_reason === "tool_calls"
  return { ok: true, supported }
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
    limit: { context: DEFAULT_CONTEXT, output: DEFAULT_OUTPUT },
  }
  if (tags.includes("thinking")) entry.reasoning = true
  if (tags.includes("vision")) entry.attachment = true
  return { entry, tags }
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

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const constants = {
  PROBE_GAP_MS,
}
