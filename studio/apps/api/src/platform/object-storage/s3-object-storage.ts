import { Readable } from "node:stream"

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

import type { StudioConfig } from "../../config.js"
import { notFound } from "../errors.js"
import type { ObjectStorage } from "./object-storage.js"

export class S3ObjectStorage implements ObjectStorage {
  readonly provider = "s3" as const
  readonly bucket: string
  private readonly client: S3Client

  constructor(config: StudioConfig["s3"]) {
    this.bucket = config.bucket
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  async ensureReady(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status !== 404) throw error
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
    }
  }

  async healthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      return true
    } catch {
      return false
    }
  }

  async put(key: string, body: Buffer, contentType: string, metadata: Record<string, string> = {}): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentLength: body.byteLength,
      ContentType: contentType,
      Metadata: metadata,
    }))
  }

  async get(key: string): Promise<{ body: Readable; contentType?: string; contentLength?: number }> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!result.Body) throw notFound("Object")
      const body = result.Body instanceof Readable
        ? result.Body
        : Readable.from(result.Body as AsyncIterable<Uint8Array>)
      return {
        body,
        ...(result.ContentType ? { contentType: result.ContentType } : {}),
        ...(result.ContentLength !== undefined ? { contentLength: result.ContentLength } : {}),
      }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404) throw notFound("Object")
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}
