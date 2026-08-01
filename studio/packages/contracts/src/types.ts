import type { Static } from "typebox"

import type {
  AttachmentKindSchema,
  AttachmentSchema,
  BootstrapSchema,
  ConversationSchema,
  ConversationSummarySchema,
  EngineSchema,
  MessageRoleSchema,
  MessageSchema,
  StudioSettingsSchema,
} from "./schemas.js"

export type AttachmentKind = Static<typeof AttachmentKindSchema>
export type Attachment = Static<typeof AttachmentSchema>
export type Bootstrap = Static<typeof BootstrapSchema>
export type Conversation = Static<typeof ConversationSchema>
export type ConversationSummary = Static<typeof ConversationSummarySchema>
export type Engine = Static<typeof EngineSchema>
export type MessageRole = Static<typeof MessageRoleSchema>
export type Message = Static<typeof MessageSchema>
export type StudioSettings = Static<typeof StudioSettingsSchema>

export interface ChatRequest {
  content: string
  attachmentIds: string[]
  clientRequestId: string
}

export type ChatStreamEvent =
  | { type: "message.started"; userMessage: Message; message: Message }
  | { type: "message.delta"; messageId: string; content: string; reasoning?: string }
  | { type: "message.completed"; message: Message }
  | { type: "message.failed"; messageId: string; error: { code: string; message: string } }

export interface LegacyLocalStorageImport {
  sourceVersion: "llm-studio-conversations-v1"
  conversations: unknown[]
  settings?: Record<string, unknown>
}
