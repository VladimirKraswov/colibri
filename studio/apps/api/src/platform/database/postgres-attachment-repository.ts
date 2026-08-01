import type { AttachmentRecord } from "../../modules/domain.js"
import type { AttachmentRepository, NewAttachment } from "../../modules/attachments/attachment-repository.js"
import { mapAttachment, type AttachmentRow } from "./mappers.js"
import type { Queryable } from "./pool.js"

const attachmentColumns = `id, workspace_id, message_id, kind, status, bucket, object_key,
  filename, mime_type, size_bytes, sha256, text_content, transcript, metadata, created_at`

export class PostgresAttachmentRepository implements AttachmentRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: NewAttachment): Promise<AttachmentRecord> {
    const result = await this.db.query<AttachmentRow>(`
      INSERT INTO attachments(
        id, workspace_id, kind, status, bucket, object_key, filename, mime_type,
        size_bytes, sha256, text_content, transcript, metadata
      ) VALUES ($1, $2, $3, 'ready', $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING ${attachmentColumns}
    `, [
      input.id, input.workspaceId, input.kind, input.bucket, input.objectKey,
      input.filename, input.mimeType, input.sizeBytes, input.sha256,
      input.textContent ?? null, input.transcript ?? null, input.metadata ?? {},
    ])
    return mapAttachment(result.rows[0]!)
  }

  async get(workspaceId: string, id: string): Promise<AttachmentRecord | null> {
    const result = await this.db.query<AttachmentRow>(
      `SELECT ${attachmentColumns} FROM attachments WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    )
    return result.rows[0] ? mapAttachment(result.rows[0]) : null
  }

  async deleteUnbound(workspaceId: string, id: string): Promise<AttachmentRecord | null> {
    const result = await this.db.query<AttachmentRow>(`
      DELETE FROM attachments
      WHERE workspace_id = $1 AND id = $2 AND message_id IS NULL
      RETURNING ${attachmentColumns}
    `, [workspaceId, id])
    return result.rows[0] ? mapAttachment(result.rows[0]) : null
  }
}
