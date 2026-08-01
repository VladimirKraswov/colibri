import type { ChatRequest } from "@colibri/contracts"

import type {
  AssistantCompletion,
  ConversationRepository,
} from "../../modules/conversations/conversation-repository.js"
import type {
  AttachmentRecord,
  ConversationRecord,
  ConversationSummaryRecord,
  MessageRecord,
  TurnCreation,
} from "../../modules/domain.js"
import { conflict, notFound } from "../errors.js"
import { mapAttachment, mapMessage, type AttachmentRow, type MessageRow } from "./mappers.js"
import { inTransaction, type DatabasePool } from "./pool.js"

interface ConversationRow {
  id: string
  workspace_id: string
  engine_id: string
  title: string
  context_summary: string | null
  compression_count: number
  message_count?: string | number
  created_at: Date
  updated_at: Date
}

const conversationColumns = `c.id, c.workspace_id, c.engine_id, c.title, c.context_summary,
  c.compression_count, c.created_at, c.updated_at`

const attachmentColumns = `id, workspace_id, message_id, kind, status, bucket, object_key,
  filename, mime_type, size_bytes, sha256, text_content, transcript, metadata, created_at`

const messageColumns = `id, conversation_id, role, content, reasoning, status, stats, created_at`

const summary = (row: ConversationRow): ConversationSummaryRecord => ({
  id: row.id,
  title: row.title,
  engineId: row.engine_id,
  messageCount: Number(row.message_count ?? 0),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const aggregate = (row: ConversationRow, messages: MessageRecord[]): ConversationRecord => ({
  ...summary({ ...row, message_count: messages.length }),
  workspaceId: row.workspace_id,
  ...(row.context_summary !== null ? { contextSummary: row.context_summary } : {}),
  compressionCount: row.compression_count,
  messages,
})

export class PostgresConversationRepository implements ConversationRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(workspaceId: string): Promise<ConversationSummaryRecord[]> {
    const result = await this.pool.query<ConversationRow>(`
      SELECT ${conversationColumns}, count(m.id)::int AS message_count
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.workspace_id = $1 AND c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `, [workspaceId])
    return result.rows.map(summary)
  }

  async get(workspaceId: string, id: string): Promise<ConversationRecord | null> {
    const conversation = await this.pool.query<ConversationRow>(`
      SELECT ${conversationColumns}
      FROM conversations c
      WHERE c.workspace_id = $1 AND c.id = $2 AND c.deleted_at IS NULL
    `, [workspaceId, id])
    const row = conversation.rows[0]
    if (!row) return null

    const messageResult = await this.pool.query<MessageRow>(`
      SELECT ${messageColumns}
      FROM messages
      WHERE conversation_id = $1
      ORDER BY ordinal
    `, [id])
    const messageIds = messageResult.rows.map((message) => message.id)
    const attachmentsByMessage = new Map<string, AttachmentRecord[]>()
    if (messageIds.length) {
      const attachmentResult = await this.pool.query<AttachmentRow>(`
        SELECT ${attachmentColumns}
        FROM attachments
        WHERE message_id = ANY($1::uuid[])
        ORDER BY created_at, id
      `, [messageIds])
      for (const attachmentRow of attachmentResult.rows) {
        if (!attachmentRow.message_id) continue
        const values = attachmentsByMessage.get(attachmentRow.message_id) ?? []
        values.push(mapAttachment(attachmentRow))
        attachmentsByMessage.set(attachmentRow.message_id, values)
      }
    }
    return aggregate(row, messageResult.rows.map((message) => mapMessage(message, attachmentsByMessage.get(message.id) ?? [])))
  }

  async create(workspaceId: string, engineId: string): Promise<ConversationRecord> {
    const result = await this.pool.query<ConversationRow>(`
      INSERT INTO conversations(workspace_id, engine_id)
      SELECT $1, id FROM engines WHERE id = $2 AND enabled = true
      RETURNING id, workspace_id, engine_id, title, context_summary, compression_count, created_at, updated_at
    `, [workspaceId, engineId])
    if (!result.rows[0]) throw notFound("Engine")
    return aggregate(result.rows[0], [])
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversations SET deleted_at = now(), updated_at = now()
      WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
    `, [workspaceId, id])
    return (result.rowCount ?? 0) > 0
  }

  async createTurn(workspaceId: string, conversationId: string, request: ChatRequest): Promise<TurnCreation> {
    const ids = [...new Set(request.attachmentIds)]
    const created = await inTransaction(this.pool, async (client) => {
      const conversation = await client.query<ConversationRow>(`
        SELECT ${conversationColumns}
        FROM conversations c
        WHERE c.workspace_id = $1 AND c.id = $2 AND c.deleted_at IS NULL
        FOR UPDATE
      `, [workspaceId, conversationId])
      if (!conversation.rows[0]) throw notFound("Conversation")

      const duplicate = await client.query(
        "SELECT id FROM messages WHERE conversation_id = $1 AND client_request_id = $2 AND role = 'user'",
        [conversationId, request.clientRequestId],
      )
      if (duplicate.rowCount) throw conflict("This client request was already accepted")

      const user = await client.query<MessageRow>(`
        INSERT INTO messages(conversation_id, role, content, client_request_id)
        VALUES ($1, 'user', $2, $3)
        RETURNING ${messageColumns}
      `, [conversationId, request.content, request.clientRequestId])
      const userRow = user.rows[0]!

      let boundAttachments: AttachmentRow[] = []
      if (ids.length) {
        const bound = await client.query<AttachmentRow>(`
          UPDATE attachments SET message_id = $3, updated_at = now()
          WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND status = 'ready' AND message_id IS NULL
          RETURNING ${attachmentColumns}
        `, [workspaceId, ids, userRow.id])
        if ((bound.rowCount ?? 0) !== ids.length) throw conflict("One or more attachments are unavailable or already bound")
        boundAttachments = bound.rows
      }

      const assistant = await client.query<MessageRow>(`
        INSERT INTO messages(conversation_id, role, status)
        VALUES ($1, 'assistant', 'streaming')
        RETURNING ${messageColumns}
      `, [conversationId])
      const assistantRow = assistant.rows[0]!
      const attachmentTitle = boundAttachments[0]?.filename ?? "Вложение"
      const proposedTitle = (request.content.trim() || attachmentTitle).replace(/\s+/g, " ").slice(0, 72)
      await client.query(`
        UPDATE conversations SET
          title = CASE WHEN title = 'Новый диалог' THEN $3 ELSE title END,
          updated_at = now()
        WHERE workspace_id = $1 AND id = $2
      `, [workspaceId, conversationId, proposedTitle])
      return {
        userMessage: mapMessage(userRow, boundAttachments.map(mapAttachment)),
        assistantMessage: mapMessage(assistantRow),
      }
    })
    const conversation = await this.get(workspaceId, conversationId)
    if (!conversation) throw notFound("Conversation")
    return { conversation, ...created }
  }

  async completeAssistant(workspaceId: string, messageId: string, completion: AssistantCompletion): Promise<MessageRecord> {
    const result = await this.pool.query<MessageRow>(`
      UPDATE messages m SET content = $3, reasoning = $4, status = $5, stats = $6
      FROM conversations c
      WHERE m.id = $2 AND m.conversation_id = c.id AND c.workspace_id = $1
      RETURNING m.id, m.conversation_id, m.role, m.content, m.reasoning, m.status, m.stats, m.created_at
    `, [
      workspaceId,
      messageId,
      completion.content,
      completion.reasoning ?? null,
      completion.status,
      completion.stats,
    ])
    const row = result.rows[0]
    if (!row) throw notFound("Assistant message")
    await this.pool.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [row.conversation_id])
    return mapMessage(row)
  }
}
