import { randomUUID } from "node:crypto"

import type { LegacyLocalStorageImport } from "@colibri/contracts"

import type { ImportRepository, ImportResult } from "../../modules/legacy-import/import-repository.js"
import { inTransaction, type DatabasePool } from "./pool.js"

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback
const boolean = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback
const date = (value: unknown) => {
  const parsed = typeof value === "number" || typeof value === "string" ? new Date(value) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export class PostgresImportRepository implements ImportRepository {
  constructor(private readonly pool: DatabasePool) {}

  async wasImported(workspaceId: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM legacy_imports WHERE workspace_id = $1 LIMIT 1", [workspaceId])
    return Boolean(result.rowCount)
  }

  async importLegacy(workspaceId: string, fingerprint: string, payload: LegacyLocalStorageImport): Promise<ImportResult> {
    return inTransaction(this.pool, async (client) => {
      const reservation = await client.query<{ id: string }>(`
        INSERT INTO legacy_imports(workspace_id, source_version, fingerprint)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, fingerprint) DO NOTHING
        RETURNING id
      `, [workspaceId, payload.sourceVersion, fingerprint])
      if (!reservation.rows[0]) return { duplicate: true, conversations: 0, messages: 0 }

      let conversationCount = 0
      let messageCount = 0
      for (const rawConversation of payload.conversations.slice(0, 2_000)) {
        const conversation = record(rawConversation)
        if (!conversation) continue
        const engineId = conversation.engineId === "gemma4" ? "gemma4" : "legacy"
        const conversationId = randomUUID()
        const createdAt = date(conversation.createdAt ?? conversation.updatedAt)
        const updatedAt = date(conversation.updatedAt ?? conversation.createdAt)
        await client.query(`
          INSERT INTO conversations(
            id, workspace_id, engine_id, title, context_summary, compression_count,
            metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          conversationId,
          workspaceId,
          engineId,
          text(conversation.title, "Импортированный диалог").slice(0, 500),
          text(conversation.contextSummary) || null,
          Math.max(0, Math.round(finite(conversation.compressionCount, 0))),
          { legacyId: text(conversation.id), importedFrom: payload.sourceVersion },
          createdAt,
          updatedAt,
        ])
        conversationCount++

        const messages = Array.isArray(conversation.messages) ? conversation.messages : []
        for (const rawMessage of messages.slice(0, 20_000)) {
          const message = record(rawMessage)
          if (!message || !["system", "user", "assistant"].includes(text(message.role))) continue
          const messageId = randomUUID()
          const rawAttachments = Array.isArray(message.attachments) ? message.attachments : []
          await client.query(`
            INSERT INTO messages(
              id, conversation_id, role, content, reasoning, status, stats, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, 'complete', $6, $7, $8)
          `, [
            messageId,
            conversationId,
            text(message.role),
            text(message.content),
            text(message.reasoning) || null,
            record(message.stats) ?? {},
            { legacyId: text(message.id) },
            date(message.createdAt ?? conversation.updatedAt),
          ])
          messageCount++

          for (const rawAttachment of rawAttachments.slice(0, 12)) {
            const attachment = record(rawAttachment)
            const kind = text(attachment?.kind)
            if (!attachment || !["image", "video", "audio", "text"].includes(kind)) continue
            const attachmentId = randomUUID()
            await client.query(`
              INSERT INTO attachments(
                id, workspace_id, message_id, kind, status, bucket, object_key,
                filename, mime_type, size_bytes, sha256, text_content, transcript, metadata
              ) VALUES ($1, $2, $3, $4, 'failed', 'legacy-local-storage', $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
              attachmentId,
              workspaceId,
              messageId,
              kind,
              `unavailable/${workspaceId}/${attachmentId}`,
              text(attachment.name, "Вложение"),
              text(attachment.mimeType, "application/octet-stream"),
              Math.max(0, Math.round(finite(attachment.size, 0))),
              "0".repeat(64),
              text(attachment.text) || null,
              text(attachment.transcript) || null,
              { unavailable: true, legacyId: text(attachment.id), asr: record(attachment.asr) ?? {} },
            ])
          }
        }
      }

      const settings = payload.settings ?? {}
      const selectedEngine = settings.engineId === "legacy" ? "legacy" : "gemma4"
      await client.query(`
        UPDATE workspace_settings SET
          default_engine_id = $2,
          system_prompt = COALESCE(NULLIF($3, ''), system_prompt),
          temperature = $4,
          top_p = $5,
          top_k = $6,
          min_p = $7,
          presence_penalty = $8,
          repeat_penalty = $9,
          max_tokens = $10,
          thinking_enabled = $11,
          auto_compress = $12,
          compression_threshold = $13,
          updated_at = now()
        WHERE workspace_id = $1
      `, [
        workspaceId,
        selectedEngine,
        text(settings.systemPrompt),
        Math.min(2, Math.max(0, finite(settings.temperature, 0.7))),
        Math.min(1, Math.max(0, finite(settings.topP, 0.8))),
        Math.max(0, Math.round(finite(settings.topK, 20))),
        Math.min(1, Math.max(0, finite(settings.minP, 0))),
        Math.min(2, Math.max(-2, finite(settings.presencePenalty, 1.5))),
        Math.max(0, finite(settings.repeatPenalty, 1)),
        Math.min(32768, Math.max(1, Math.round(finite(settings.maxTokens, 4096)))),
        boolean(settings.thinkingEnabled, false),
        boolean(settings.autoCompress, true),
        Math.min(95, Math.max(50, Math.round(finite(settings.compressionThreshold, 75)))),
      ])
      await client.query(`
        UPDATE legacy_imports
        SET imported_conversations = $2, imported_messages = $3
        WHERE id = $1
      `, [reservation.rows[0].id, conversationCount, messageCount])
      return { duplicate: false, conversations: conversationCount, messages: messageCount }
    })
  }
}
