// iibcode fork: standalone "Rate limit" sidebar section rendering the GWDG
// x-ratelimit-* snapshot captured by the session.llm wrapStream middleware
// (see processor.ts extractRateLimit). Lives in its own file so the upstream
// context.tsx only needs a two-line addition to wire it up.
import type { AssistantMessage, Message } from "@opencode-ai/sdk/v2"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createMemo, Show } from "solid-js"

type RateLimitInfo = {
  minute?: { limit: number; remaining: number }
  hour?: { limit: number; remaining: number }
}

type ExtendedAssistantMessage = AssistantMessage & { rateLimit?: RateLimitInfo }

// The most recent assistant message that actually produced output — the
// source for the rate-limit snapshot.
function lastAssistant(messages: readonly Message[]) {
  return messages.findLast(
    (item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0,
  )
}

function RateLimitView(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))

  const rateLimit = createMemo(() => (lastAssistant(msg()) as ExtendedAssistantMessage | undefined)?.rateLimit ?? null)

  const minuteText = createMemo(() => {
    const m = rateLimit()?.minute
    return m ? `${m.remaining}/${m.limit} req/min` : null
  })
  const hourText = createMemo(() => {
    const h = rateLimit()?.hour
    return h ? `${h.remaining}/${h.limit} req/hr` : null
  })
  const hasAny = createMemo(() => Boolean(minuteText() || hourText()))

  return (
    <box>
      <text fg={theme().text}>
        <b>Rate limit</b>
      </text>
      <Show when={hasAny()} fallback={<text fg={theme().textMuted}>N/A</text>}>
        <Show when={minuteText()}>
          <text fg={theme().success}>{minuteText()}</text>
        </Show>
        <Show when={hourText()}>
          <text fg={theme().success}>{hourText()}</text>
        </Show>
      </Show>
    </box>
  )
}

// Registers the section at order 150: directly below Context (order 100) and
// above MCP (order 200). Called from context.tsx's plugin setup; runtime.ts
// gives each register() call its own slot id.
export function registerRateLimitSlot(api: TuiPluginApi) {
  api.slots.register({
    order: 150,
    slots: {
      sidebar_content(_ctx, props) {
        return <RateLimitView api={api} session_id={props.session_id} />
      },
    },
  })
}
