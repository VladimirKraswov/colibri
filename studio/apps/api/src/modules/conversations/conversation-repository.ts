import type { ChatRequest } from "@llm-control/contracts"

import type {
  ConversationRecord,
  ConversationSummaryRecord,
  MessageRecord,
  TurnCreation,
} from "../domain.js"

export interface AssistantCompletion {
  content: string
  reasoning?: string
  status: "complete" | "cancelled" | "failed"
  stats: Record<string, unknown>
}

export interface ConversationRepository {
  list(workspaceId: string): Promise<ConversationSummaryRecord[]>
  get(workspaceId: string, id: string): Promise<ConversationRecord | null>
  create(workspaceId: string, engineId: string): Promise<ConversationRecord>
  delete(workspaceId: string, id: string): Promise<boolean>
  createTurn(workspaceId: string, conversationId: string, request: ChatRequest): Promise<TurnCreation>
  completeAssistant(workspaceId: string, messageId: string, completion: AssistantCompletion): Promise<MessageRecord>
}
