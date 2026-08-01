import type { Conversation, Message } from "@ai-control-center/contracts"
import { describe, expect, it } from "vitest"

import { updateFromStream } from "./stream-state.js"

const assistant: Message = {
  id: "22222222-2222-4222-8222-222222222222",
  conversationId: "11111111-1111-4111-8111-111111111111",
  role: "assistant", content: "", status: "streaming", attachments: [], createdAt: "2026-08-01T00:00:00.000Z",
}
const conversation: Conversation = {
  id: assistant.conversationId, title: "test", engineId: "gemma4", messageCount: 1,
  compressionCount: 0, messages: [assistant], createdAt: assistant.createdAt, updatedAt: assistant.createdAt,
}

describe("updateFromStream", () => {
  it("accumulates textual and reasoning deltas without losing the message", () => {
    const first = updateFromStream(conversation, { type: "message.delta", messageId: assistant.id, content: "Ответ", reasoning: "A" })
    const second = updateFromStream(first, { type: "message.delta", messageId: assistant.id, content: " готов", reasoning: "B" })
    expect(second.messages[0]?.content).toBe("Ответ готов")
    expect(second.messages[0]?.reasoning).toBe("AB")
  })
})
