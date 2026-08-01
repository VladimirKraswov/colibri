import { afterEach, describe, expect, it, vi } from "vitest"

import { OpenAIProvider } from "./openai-provider.js"

describe("OpenAIProvider", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("normalizes CRLF SSE and exposes content, reasoning and usage", async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"думаю "}}]}\r\n\r\n'))
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"готово"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2},"timings":{"predicted_per_second":7.5}}\r\n\r\ndata: [DONE]\r\n\r\n'))
      controller.close()
    } })
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })))
    const provider = new OpenAIProvider("http://provider")
    const chunks = []
    for await (const chunk of provider.stream([{ role: "user", content: "test" }], {
      model: "model", temperature: 0.7, topP: 0.8, topK: 20, minP: 0,
      presencePenalty: 0, repeatPenalty: 1, maxTokens: 100, thinkingEnabled: true,
    }, new AbortController().signal)) chunks.push(chunk)
    expect(chunks).toEqual([
      { type: "delta", reasoning: "думаю " },
      { type: "delta", content: "готово" },
      { type: "done", usage: { promptTokens: 10, completionTokens: 2 }, finishReason: "stop", tokensPerSecond: 7.5 },
    ])
  })
})
