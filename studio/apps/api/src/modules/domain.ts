import type { Attachment, Conversation, ConversationSummary, Message, StudioSettings } from "@colibri/contracts"

export interface WorkspaceRecord {
  id: string
  slug: string
  name: string
}

export interface EngineRecord {
  id: string
  providerKey: string
  displayName: string
  description: string
  model: string
  contextWindow: number
  capabilities: string[]
}

export interface AttachmentRecord extends Omit<Attachment, "contentUrl"> {
  workspaceId: string
  messageId?: string
  bucket: string
  objectKey: string
  sha256: string
}

export interface MessageRecord extends Omit<Message, "attachments"> {
  attachments: AttachmentRecord[]
}

export interface ConversationRecord extends Omit<Conversation, "messages"> {
  workspaceId: string
  messages: MessageRecord[]
}

export type ConversationSummaryRecord = ConversationSummary
export type SettingsRecord = StudioSettings

export interface TurnCreation {
  conversation: ConversationRecord
  userMessage: MessageRecord
  assistantMessage: MessageRecord
}
