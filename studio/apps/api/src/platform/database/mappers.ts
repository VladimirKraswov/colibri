import type { AttachmentRecord, MessageRecord } from "../../modules/domain.js"

export interface AttachmentRow {
  id: string
  workspace_id: string
  message_id: string | null
  kind: AttachmentRecord["kind"]
  status: AttachmentRecord["status"]
  bucket: string
  object_key: string
  filename: string
  mime_type: string
  size_bytes: string | number
  sha256: string
  text_content: string | null
  transcript: string | null
  metadata: Record<string, unknown>
  created_at: Date
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: MessageRecord["role"]
  content: string
  reasoning: string | null
  status: MessageRecord["status"]
  stats: Record<string, unknown>
  created_at: Date
}

export const mapAttachment = (row: AttachmentRow): AttachmentRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  ...(row.message_id ? { messageId: row.message_id } : {}),
  kind: row.kind,
  status: row.status,
  bucket: row.bucket,
  objectKey: row.object_key,
  filename: row.filename,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes),
  sha256: row.sha256,
  ...(row.text_content !== null ? { textContent: row.text_content } : {}),
  ...(row.transcript !== null ? { transcript: row.transcript } : {}),
  metadata: row.metadata,
  createdAt: row.created_at.toISOString(),
})

export const mapMessage = (row: MessageRow, attachments: AttachmentRecord[] = []): MessageRecord => {
  const stats = row.stats as NonNullable<MessageRecord["stats"]>
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    ...(row.reasoning !== null ? { reasoning: row.reasoning } : {}),
    status: row.status,
    ...(Object.keys(row.stats).length ? { stats } : {}),
    attachments,
    createdAt: row.created_at.toISOString(),
  }
}
