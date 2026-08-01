import type { AttachmentKind } from "@colibri/contracts"

import type { AttachmentRecord } from "../domain.js"

export interface NewAttachment {
  id: string
  workspaceId: string
  kind: AttachmentKind
  bucket: string
  objectKey: string
  filename: string
  mimeType: string
  sizeBytes: number
  sha256: string
  textContent?: string
  transcript?: string
  metadata?: Record<string, unknown>
}

export interface AttachmentRepository {
  create(input: NewAttachment): Promise<AttachmentRecord>
  get(workspaceId: string, id: string): Promise<AttachmentRecord | null>
  deleteUnbound(workspaceId: string, id: string): Promise<AttachmentRecord | null>
}
