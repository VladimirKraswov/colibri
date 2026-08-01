import type { ChatStreamEvent, Conversation } from "@ai-control-center/contracts"

export const updateFromStream = (conversation: Conversation, event: ChatStreamEvent): Conversation => {
  if (event.type === "message.started") {
    return { ...conversation, messages: [...conversation.messages, event.userMessage, event.message], messageCount: conversation.messageCount + 2 }
  }
  if (event.type === "message.delta") {
    return { ...conversation, messages: conversation.messages.map((message) => message.id === event.messageId
      ? { ...message, content: message.content + event.content, reasoning: `${message.reasoning ?? ""}${event.reasoning ?? ""}` }
      : message) }
  }
  if (event.type === "message.completed") {
    return { ...conversation, messages: conversation.messages.map((message) => message.id === event.message.id ? event.message : message) }
  }
  if (event.type === "message.failed") {
    return { ...conversation, messages: conversation.messages.map((message) => message.id === event.messageId ? { ...message, status: "failed" as const } : message) }
  }
  return conversation
}
