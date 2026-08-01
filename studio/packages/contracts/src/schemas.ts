import { Type } from "typebox"

export const IdSchema = Type.String({ format: "uuid" })
export const DateTimeSchema = Type.String({ format: "date-time" })
export const MessageRoleSchema = Type.Union([
  Type.Literal("system"),
  Type.Literal("user"),
  Type.Literal("assistant"),
])
export const AttachmentKindSchema = Type.Union([
  Type.Literal("image"),
  Type.Literal("video"),
  Type.Literal("audio"),
  Type.Literal("text"),
])

export const EngineSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  displayName: Type.String(),
  description: Type.String(),
  model: Type.String(),
  contextWindow: Type.Integer({ minimum: 1024 }),
  capabilities: Type.Array(Type.String()),
  status: Type.Union([Type.Literal("online"), Type.Literal("offline"), Type.Literal("checking")]),
  slotsIdle: Type.Integer({ minimum: 0 }),
  slotsTotal: Type.Integer({ minimum: 0 }),
})

export const AttachmentSchema = Type.Object({
  id: IdSchema,
  kind: AttachmentKindSchema,
  filename: Type.String(),
  mimeType: Type.String(),
  sizeBytes: Type.Integer({ minimum: 0 }),
  status: Type.Union([Type.Literal("pending"), Type.Literal("ready"), Type.Literal("failed")]),
  transcript: Type.Optional(Type.String()),
  textContent: Type.Optional(Type.String()),
  metadata: Type.Record(Type.String(), Type.Unknown()),
  contentUrl: Type.String(),
  createdAt: DateTimeSchema,
})

export const MessageStatsSchema = Type.Object({
  promptTokens: Type.Optional(Type.Integer({ minimum: 0 })),
  completionTokens: Type.Optional(Type.Integer({ minimum: 0 })),
  tokensPerSecond: Type.Optional(Type.Number({ minimum: 0 })),
  elapsedSeconds: Type.Optional(Type.Number({ minimum: 0 })),
  finishReason: Type.Optional(Type.String()),
})

export const MessageSchema = Type.Object({
  id: IdSchema,
  conversationId: IdSchema,
  role: MessageRoleSchema,
  content: Type.String(),
  reasoning: Type.Optional(Type.String()),
  status: Type.Union([
    Type.Literal("complete"),
    Type.Literal("streaming"),
    Type.Literal("cancelled"),
    Type.Literal("failed"),
  ]),
  stats: Type.Optional(MessageStatsSchema),
  attachments: Type.Array(AttachmentSchema),
  createdAt: DateTimeSchema,
})

export const ConversationSummarySchema = Type.Object({
  id: IdSchema,
  title: Type.String(),
  engineId: Type.String(),
  messageCount: Type.Integer({ minimum: 0 }),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
})

export const ConversationSchema = Type.Intersect([
  ConversationSummarySchema,
  Type.Object({
    contextSummary: Type.Optional(Type.String()),
    compressionCount: Type.Integer({ minimum: 0 }),
    messages: Type.Array(MessageSchema),
  }),
])

export const StudioSettingsSchema = Type.Object({
  defaultEngineId: Type.String(),
  systemPrompt: Type.String(),
  temperature: Type.Number({ minimum: 0, maximum: 2 }),
  topP: Type.Number({ minimum: 0, maximum: 1 }),
  topK: Type.Integer({ minimum: 0 }),
  minP: Type.Number({ minimum: 0, maximum: 1 }),
  presencePenalty: Type.Number({ minimum: -2, maximum: 2 }),
  repeatPenalty: Type.Number({ minimum: 0 }),
  maxTokens: Type.Integer({ minimum: 1, maximum: 32768 }),
  thinkingEnabled: Type.Boolean(),
  autoCompress: Type.Boolean(),
  compressionThreshold: Type.Integer({ minimum: 50, maximum: 95 }),
})

export const BootstrapSchema = Type.Object({
  workspace: Type.Object({ id: IdSchema, slug: Type.String(), name: Type.String() }),
  engines: Type.Array(EngineSchema),
  settings: StudioSettingsSchema,
  conversations: Type.Array(ConversationSummarySchema),
  storage: Type.Object({ provider: Type.Literal("s3"), bucket: Type.String(), healthy: Type.Boolean() }),
  migration: Type.Object({ localStorageImported: Type.Boolean() }),
})

export const ErrorSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    requestId: Type.Optional(Type.String()),
  }),
})
