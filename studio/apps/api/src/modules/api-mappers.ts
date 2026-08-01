import type { Attachment, Conversation, ConversationSummary, Message } from "@llm-control/contracts"

import type {
  AttachmentRecord,
  ConversationRecord,
  ConversationSummaryRecord,
  MessageRecord,
} from "./domain.js"

export const attachmentDto = (attachment: AttachmentRecord): Attachment => ({
  id: attachment.id,
  kind: attachment.kind,
  filename: attachment.filename,
  mimeType: attachment.mimeType,
  sizeBytes: attachment.sizeBytes,
  status: attachment.status,
  ...(attachment.transcript !== undefined ? { transcript: attachment.transcript } : {}),
  ...(attachment.textContent !== undefined ? { textContent: attachment.textContent } : {}),
  metadata: attachment.metadata,
  contentUrl: `/api/v1/attachments/${attachment.id}/content`,
  createdAt: attachment.createdAt,
})

export const messageDto = (message: MessageRecord): Message => ({
  id: message.id,
  conversationId: message.conversationId,
  role: message.role,
  content: message.content,
  ...(message.reasoning !== undefined ? { reasoning: message.reasoning } : {}),
  status: message.status,
  ...(message.stats !== undefined ? { stats: message.stats } : {}),
  attachments: message.attachments.map(attachmentDto),
  createdAt: message.createdAt,
})

export const conversationSummaryDto = (conversation: ConversationSummaryRecord): ConversationSummary => conversation

export const conversationDto = (conversation: ConversationRecord): Conversation => ({
  id: conversation.id,
  title: conversation.title,
  engineId: conversation.engineId,
  messageCount: conversation.messageCount,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  ...(conversation.contextSummary !== undefined ? { contextSummary: conversation.contextSummary } : {}),
  compressionCount: conversation.compressionCount,
  messages: conversation.messages.map(messageDto),
})
