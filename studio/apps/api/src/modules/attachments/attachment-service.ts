import { createHash, randomUUID } from "node:crypto"

import type { AttachmentKind } from "@ai-control-center/contracts"

import { AppError, notFound } from "../../platform/errors.js"
import type { ObjectStorage } from "../../platform/object-storage/object-storage.js"
import type { WorkspaceRecord } from "../domain.js"
import type { AttachmentRepository } from "./attachment-repository.js"
import { SpeechService } from "../speech/speech-service.js"

const limits: Record<AttachmentKind, number> = {
  image: 12 * 1024 ** 2,
  video: 32 * 1024 ** 2,
  audio: 24 * 1024 ** 2,
  text: 256 * 1024,
}

const textExtensions = new Set([
  "txt", "md", "markdown", "json", "jsonl", "csv", "tsv", "log", "yaml", "yml",
  "xml", "html", "css", "js", "jsx", "ts", "tsx", "py", "sh", "c", "cpp", "h",
  "hpp", "rs", "go", "java", "kt", "sql", "ini", "toml", "conf", "env",
])

const extension = (filename: string) => filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : ""

export function attachmentKind(filename: string, mimeType: string): AttachmentKind {
  const mime = mimeType.toLowerCase()
  const ext = extension(filename)
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/") || ["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "wma", "aiff"].includes(ext)) return "audio"
  if (mime.startsWith("text/") || ["application/json", "application/xml", "application/x-yaml"].includes(mime) || textExtensions.has(ext)) return "text"
  throw new AppError("unsupported_attachment", `Unsupported file type: ${filename}`, 415)
}

const safeFilename = (value: string) => value.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 180) || "attachment"

export class AttachmentService {
  constructor(
    private readonly workspace: WorkspaceRecord,
    private readonly repository: AttachmentRepository,
    private readonly storage: ObjectStorage,
    private readonly speech: SpeechService,
  ) {}

  async upload(filename: string, mimeType: string, body: Buffer) {
    const kind = attachmentKind(filename, mimeType)
    if (!body.byteLength) throw new AppError("empty_attachment", "The uploaded file is empty")
    if (body.byteLength > limits[kind]) {
      const limit = limits[kind] >= 1024 ** 2
        ? `${Math.round(limits[kind] / 1024 ** 2)} MB`
        : `${Math.round(limits[kind] / 1024)} KB`
      throw new AppError("attachment_too_large", `${filename} exceeds the ${limit} limit`, 413)
    }
    const id = randomUUID()
    const sha256 = createHash("sha256").update(body).digest("hex")
    const normalizedName = safeFilename(filename)
    const objectKey = `${this.workspace.id}/${id}/${normalizedName}`
    let textContent: string | undefined
    let transcript: string | undefined
    let metadata: Record<string, unknown> = {}
    if (kind === "text") textContent = body.toString("utf8").replace(/^\uFEFF/, "")
    if (kind === "audio") {
      const transcription = await this.speech.transcribe(body, normalizedName, mimeType)
      transcript = transcription.text
      metadata = { asr: transcription.metadata }
    }

    await this.storage.put(objectKey, body, mimeType, { sha256, kind })
    try {
      return await this.repository.create({
        id,
        workspaceId: this.workspace.id,
        kind,
        bucket: this.storage.bucket,
        objectKey,
        filename: normalizedName,
        mimeType,
        sizeBytes: body.byteLength,
        sha256,
        ...(textContent !== undefined ? { textContent } : {}),
        ...(transcript !== undefined ? { transcript } : {}),
        metadata,
      })
    } catch (error) {
      await this.storage.delete(objectKey).catch(() => undefined)
      throw error
    }
  }

  async get(id: string) {
    const attachment = await this.repository.get(this.workspace.id, id)
    if (!attachment) throw notFound("Attachment")
    return attachment
  }

  async delete(id: string): Promise<void> {
    const attachment = await this.repository.deleteUnbound(this.workspace.id, id)
    if (!attachment) throw notFound("Unbound attachment")
    await this.storage.delete(attachment.objectKey)
  }
}
