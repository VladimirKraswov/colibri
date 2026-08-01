import { createHash } from "node:crypto"

import type { ChatRequest, LegacyLocalStorageImport, StudioSettings } from "@colibri/contracts"
import { StudioSettingsSchema } from "@colibri/contracts"
import type { FastifyInstance, FastifyReply } from "fastify"
import { Type } from "typebox"

import { attachmentDto, conversationDto, conversationSummaryDto } from "./modules/api-mappers.js"
import { EngineService } from "./modules/engines/engine-service.js"
import { AppError, notFound } from "./platform/errors.js"
import type { StudioServices } from "./services.js"

const IdParamsSchema = Type.Object({ id: Type.String({ format: "uuid" }) })
const CreateConversationSchema = Type.Object({ engineId: Type.String({ minLength: 1, maxLength: 64 }) })
const ChatRequestSchema = Type.Object({
  content: Type.String({ maxLength: 1_000_000 }),
  attachmentIds: Type.Array(Type.String({ format: "uuid" }), { maxItems: 12 }),
  clientRequestId: Type.String({ format: "uuid" }),
})
const LegacyImportSchema = Type.Object({
  sourceVersion: Type.Literal("llm-studio-conversations-v1"),
  conversations: Type.Array(Type.Unknown(), { maxItems: 2_000 }),
  settings: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
})

const writeSse = (reply: FastifyReply, value: unknown) => {
  reply.raw.write(`data: ${JSON.stringify(value)}\n\n`)
}

export async function registerApiRoutes(app: FastifyInstance, services: StudioServices): Promise<void> {
  const engineService = new EngineService(services.engines, services.providers)

  app.get("/health", async (_request, reply) => {
    const [database, storage, engines] = await Promise.all([
      services.pool.query("SELECT 1").then(() => true).catch(() => false),
      services.storage.healthy(),
      engineService.list().catch(() => []),
    ])
    const providers = Object.fromEntries(engines.map((engine) => [engine.id, engine.status]))
    const healthy = database && storage && engines.length > 0 && engines.some((engine) => engine.status === "online")
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      database,
      storage,
      providers,
    })
  })

  app.get("/bootstrap", async () => {
    const [engines, settings, conversations, storageHealthy, localStorageImported] = await Promise.all([
      engineService.list(),
      services.settings.get(services.workspace.id),
      services.conversations.list(services.workspace.id),
      services.storage.healthy(),
      services.imports.wasImported(services.workspace.id),
    ])
    if (!settings) throw new AppError("settings_missing", "Workspace settings are missing", 500)
    return {
      workspace: services.workspace,
      engines,
      settings,
      conversations: conversations.map(conversationSummaryDto),
      storage: { provider: "s3" as const, bucket: services.storage.bucket, healthy: storageHealthy },
      migration: { localStorageImported },
    }
  })

  app.get("/engines", async () => engineService.list())

  app.put<{ Body: StudioSettings }>("/settings", { schema: { body: StudioSettingsSchema } }, async (request) => {
    if (!await services.engines.get(request.body.defaultEngineId)) throw notFound("Engine")
    return services.settings.update(services.workspace.id, request.body)
  })

  app.get("/conversations", async () =>
    (await services.conversations.list(services.workspace.id)).map(conversationSummaryDto))

  app.post<{ Body: { engineId: string } }>("/conversations", {
    schema: { body: CreateConversationSchema },
  }, async (request, reply) => {
    const conversation = await services.conversations.create(services.workspace.id, request.body.engineId)
    return reply.code(201).send(conversationDto(conversation))
  })

  app.get<{ Params: { id: string } }>("/conversations/:id", {
    schema: { params: IdParamsSchema },
  }, async (request) => {
    const conversation = await services.conversations.get(services.workspace.id, request.params.id)
    if (!conversation) throw notFound("Conversation")
    return conversationDto(conversation)
  })

  app.delete<{ Params: { id: string } }>("/conversations/:id", {
    schema: { params: IdParamsSchema },
  }, async (request, reply) => {
    if (!await services.conversations.delete(services.workspace.id, request.params.id)) throw notFound("Conversation")
    return reply.code(204).send()
  })

  app.post("/attachments", async (request, reply) => {
    const file = await request.file()
    if (!file) throw new AppError("file_required", "Multipart field with a file is required")
    const attachment = await services.attachmentService.upload(
      file.filename,
      file.mimetype || "application/octet-stream",
      await file.toBuffer(),
    )
    return reply.code(201).send(attachmentDto(attachment))
  })

  app.get<{ Params: { id: string } }>("/attachments/:id/content", {
    schema: { params: IdParamsSchema },
  }, async (request, reply) => {
    const attachment = await services.attachmentService.get(request.params.id)
    if (attachment.status !== "ready") throw new AppError("attachment_unavailable", "Attachment content is unavailable", 410)
    const object = await services.storage.get(attachment.objectKey)
    reply.header("content-type", object.contentType ?? attachment.mimeType)
    reply.header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`)
    reply.header("cache-control", "private, max-age=3600")
    if (object.contentLength !== undefined) reply.header("content-length", object.contentLength)
    return reply.send(object.body)
  })

  app.delete<{ Params: { id: string } }>("/attachments/:id", {
    schema: { params: IdParamsSchema },
  }, async (request, reply) => {
    await services.attachmentService.delete(request.params.id)
    return reply.code(204).send()
  })

  app.post("/transcriptions", async (request) => {
    const file = await request.file()
    if (!file) throw new AppError("file_required", "Audio file is required")
    return services.speech.transcribe(await file.toBuffer(), file.filename, file.mimetype)
  })

  app.post<{ Body: ChatRequest; Params: { id: string } }>("/conversations/:id/messages:stream", {
    schema: { params: IdParamsSchema, body: ChatRequestSchema },
  }, async (request, reply) => {
    const abort = new AbortController()
    reply.raw.once("close", () => { if (!reply.raw.writableEnded) abort.abort() })
    reply.hijack()
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    })
    try {
      for await (const event of services.chatService.stream(request.params.id, request.body, abort.signal)) {
        writeSse(reply, event)
      }
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : new AppError("stream_failed", error instanceof Error ? error.message : "Streaming failed", 500)
      writeSse(reply, { type: "error", error: { code: appError.code, message: appError.message } })
    } finally {
      reply.raw.end()
    }
  })

  app.post<{ Body: LegacyLocalStorageImport }>("/import/local-storage", {
    schema: { body: LegacyImportSchema },
  }, async (request) => {
    const fingerprint = createHash("sha256").update(JSON.stringify(request.body)).digest("hex")
    return services.imports.importLegacy(services.workspace.id, fingerprint, request.body)
  })
}
