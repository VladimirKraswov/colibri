import { AppError, unavailable } from "../errors.js"
import type {
  GenerationOptions,
  InferenceProvider,
  ProviderChunk,
  ProviderHealth,
  ProviderMessage,
} from "./inference-provider.js"
import { trimRepeatedSuffix } from "./repetition.js"

const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined

export class OpenAIProvider implements InferenceProvider {
  constructor(private readonly baseUrl: string) {}

  async health(): Promise<ProviderHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3_000) })
      if (!response.ok) return { online: false, slotsIdle: 0, slotsTotal: 0 }
      const body = await response.json() as Record<string, unknown>
      const slotsIdle = number(body.slots_idle) ?? (body.status === "ok" ? 1 : 0)
      const slotsProcessing = number(body.slots_processing) ?? 0
      return { online: true, slotsIdle, slotsTotal: Math.max(1, slotsIdle + slotsProcessing) }
    } catch {
      return { online: false, slotsIdle: 0, slotsTotal: 0 }
    }
  }

  async *stream(messages: ProviderMessage[], options: GenerationOptions, signal: AbortSignal): AsyncGenerator<ProviderChunk> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: options.temperature,
        top_p: options.topP,
        top_k: options.topK,
        min_p: options.minP,
        presence_penalty: options.presencePenalty,
        repeat_penalty: options.repeatPenalty,
        max_tokens: options.maxTokens,
        seed: -1,
        chat_template_kwargs: { enable_thinking: options.thinkingEnabled },
      }),
    })
    if (!response.ok || !response.body) {
      const detail = (await response.text()).slice(0, 1_000)
      throw unavailable(`Inference provider returned ${response.status}: ${detail}`)
    }

    const decoder = new TextDecoder()
    let buffer = ""
    let generatedContent = ""
    let finalUsage: ProviderChunk | undefined
    for await (const raw of response.body) {
      buffer += decoder.decode(raw, { stream: true }).replace(/\r\n/g, "\n")
      while (true) {
        const boundary = buffer.indexOf("\n\n")
        if (boundary < 0) break
        const event = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (!data || data === "[DONE]") continue
          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(data) as Record<string, unknown>
          } catch {
            continue
          }
          const choices = Array.isArray(parsed.choices) ? parsed.choices : []
          const choice = choices[0] as Record<string, unknown> | undefined
          const delta = choice?.delta as Record<string, unknown> | undefined
          const content = typeof delta?.content === "string" ? delta.content : undefined
          const reasoning = typeof delta?.reasoning_content === "string" ? delta.reasoning_content : undefined
          if (content || reasoning) {
            generatedContent += content ?? ""
            yield { type: "delta", ...(content ? { content } : {}), ...(reasoning ? { reasoning } : {}) }
            if (trimRepeatedSuffix(generatedContent).stopped) {
              yield { type: "done", finishReason: "repetition" }
              return
            }
          }

          const usage = parsed.usage as Record<string, unknown> | undefined
          const timings = parsed.timings as Record<string, unknown> | undefined
          if (usage || choice?.finish_reason) {
            const promptTokens = number(usage?.prompt_tokens)
            const completionTokens = number(usage?.completion_tokens)
            const tokensPerSecond = number(timings?.predicted_per_second)
            finalUsage = {
              type: "done",
              ...(usage ? { usage: {
                ...(promptTokens !== undefined ? { promptTokens } : {}),
                ...(completionTokens !== undefined ? { completionTokens } : {}),
              } } : {}),
              ...(typeof choice?.finish_reason === "string" ? { finishReason: choice.finish_reason } : {}),
              ...(tokensPerSecond !== undefined ? { tokensPerSecond } : {}),
            }
          }
        }
      }
    }
    yield finalUsage ?? { type: "done" }
  }
}

export class ProviderRegistry {
  constructor(private readonly providers: Map<string, InferenceProvider>) {}

  get(providerKey: string): InferenceProvider {
    const provider = this.providers.get(providerKey)
    if (!provider) throw new AppError("provider_not_configured", `Provider ${providerKey} is not configured`, 500)
    return provider
  }
}
