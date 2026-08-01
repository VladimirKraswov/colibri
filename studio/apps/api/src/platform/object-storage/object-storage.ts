import type { Readable } from "node:stream"

export interface ObjectStorage {
  readonly provider: "s3"
  readonly bucket: string
  ensureReady(): Promise<void>
  healthy(): Promise<boolean>
  put(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<void>
  get(key: string): Promise<{ body: Readable; contentType?: string; contentLength?: number }>
  delete(key: string): Promise<void>
}
