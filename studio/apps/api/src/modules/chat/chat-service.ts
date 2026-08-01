import type { Readable } from "node:stream"

import type { ChatRequest, ChatStreamEvent } from "@colibri/contracts"

import { AppError, notFound } from "../../platform/errors.js"
import type {
  GenerationOptions,
  OpenAIContentPart,
  ProviderMessage,
} from "../../platform/inference/inference-provider.js"
import type { ObjectStorage } from "../../platform/object-storage/object-storage.js"
import type { ProviderRegistry } from "../../platform/inference/openai-provider.js"
import { trimRepeatedSuffix } from "../../platform/inference/repetition.js"
import type { AttachmentRepository } from "../attachments/attachment-repository.js"
import type { ConversationRepository } from "../conversations/conversation-repository.js"
import type { AttachmentRecord, MessageRecord, WorkspaceRecord } from "../domain.js"
import type { EngineRepository } from "../engines/engine-repository.js"
import type { SettingsRepository } from "../settings/settings-repository.js"
import { messageDto } from "../api-mappers.js"

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const videoFormat = (mimeType: string) => mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "auto"

export class ChatService {
  constructor(
    private readonly workspace: WorkspaceRecord,
    private readonly conversations: ConversationRepository,
    private readonly attachments: AttachmentRepository,
    private readonly engines: EngineRepository,
    private readonly settings: SettingsRepository,
    private readonly storage: ObjectStorage,
    private readonly providers: ProviderRegistry,
  ) {}

  async *stream(conversationId: string, request: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    if (!request.content.trim() && !request.attachmentIds.length) {
      throw new AppError("empty_message", "Message text or at least one attachment is required")
    }
    const before = await this.conversations.get(this.workspace.id, conversationId)
    if (!before) throw notFound("Conversation")
    const engine = await this.engines.get(before.engineId)
    if (!engine) throw notFound("Engine")

    for (const attachmentId of [...new Set(request.attachmentIds)]) {
      const attachment = await this.attachments.get(this.workspace.id, attachmentId)
      if (!attachment || attachment.messageId || attachment.status !== "ready") {
        throw new AppError("attachment_unavailable", `Attachment ${attachmentId} is unavailable`, 409)
      }
      if (["image", "video"].includes(attachment.kind) && !engine.capabilities.includes(attachment.kind)) {
        throw new AppError("engine_capability", `${engine.displayName} does not support ${attachment.kind}`, 422)
      }
    }

    const turn = await this.conversations.createTurn(this.workspace.id, conversationId, request)
    yield {
      type: "message.started",
      userMessage: messageDto(turn.userMessage),
      message: messageDto(turn.assistantMessage),
    }

    const currentSettings = await this.settings.get(this.workspace.id)
    if (!currentSettings) throw new AppError("settings_missing", "Workspace settings are missing", 500)
    const provider = this.providers.get(engine.providerKey)
    const prompt = await this.buildPrompt(turn.conversation.messages, currentSettings.systemPrompt)
    const options: GenerationOptions = {
      model: engine.model,
      temperature: currentSettings.temperature,
      topP: currentSettings.topP,
      topK: currentSettings.topK,
      minP: currentSettings.minP,
      presencePenalty: currentSettings.presencePenalty,
      repeatPenalty: currentSettings.repeatPenalty,
      maxTokens: currentSettings.maxTokens,
      thinkingEnabled: currentSettings.thinkingEnabled,
    }
    let content = ""
    let reasoning = ""
    let usage: { promptTokens?: number; completionTokens?: number } = {}
    let finishReason: string | undefined
    let tokensPerSecond: number | undefined
    let generatedChunks = 0
    const started = performance.now()
    try {
      for await (const chunk of provider.stream(prompt, options, signal)) {
        if (chunk.type === "delta") {
          content += chunk.content ?? ""
          reasoning += chunk.reasoning ?? ""
          if (chunk.content) generatedChunks++
          yield {
            type: "message.delta",
            messageId: turn.assistantMessage.id,
            content: chunk.content ?? "",
            ...(chunk.reasoning ? { reasoning: chunk.reasoning } : {}),
          }
        } else {
          usage = chunk.usage ?? usage
          finishReason = chunk.finishReason
          tokensPerSecond = chunk.tokensPerSecond
        }
      }
      const cleaned = trimRepeatedSuffix(content)
      content = cleaned.content
      if (cleaned.stopped) finishReason = "repetition"
      const elapsedSeconds = (performance.now() - started) / 1_000
      const completionTokens = usage.completionTokens ?? generatedChunks
      const measuredTokensPerSecond = tokensPerSecond ?? (generatedChunks ? generatedChunks / Math.max(elapsedSeconds, 0.1) : undefined)
      const message = await this.conversations.completeAssistant(this.workspace.id, turn.assistantMessage.id, {
        content: content || "Модель завершила ответ без текстового содержимого.",
        ...(reasoning ? { reasoning } : {}),
        status: signal.aborted ? "cancelled" : "complete",
        stats: {
          ...(usage.promptTokens !== undefined ? { promptTokens: usage.promptTokens } : {}),
          ...(completionTokens ? { completionTokens } : {}),
          ...(measuredTokensPerSecond !== undefined ? { tokensPerSecond: measuredTokensPerSecond } : {}),
          elapsedSeconds,
          ...(finishReason ? { finishReason } : {}),
        },
      })
      yield { type: "message.completed", message: messageDto(message) }
    } catch (error) {
      const aborted = signal.aborted || (
        typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
      )
      const message = await this.conversations.completeAssistant(this.workspace.id, turn.assistantMessage.id, {
        content,
        ...(reasoning ? { reasoning } : {}),
        status: aborted ? "cancelled" : "failed",
        stats: { elapsedSeconds: (performance.now() - started) / 1_000 },
      })
      if (aborted) {
        yield { type: "message.completed", message: messageDto(message) }
        return
      }
      const appError = error instanceof AppError ? error : new AppError("generation_failed", error instanceof Error ? error.message : "Generation failed", 502)
      yield {
        type: "message.failed",
        messageId: turn.assistantMessage.id,
        error: { code: appError.code, message: appError.message },
      }
    }
  }

  private async buildPrompt(messages: MessageRecord[], systemPrompt: string): Promise<ProviderMessage[]> {
    const result: ProviderMessage[] = [{ role: "system", content: systemPrompt }]
    for (const message of messages) {
      if (message.role === "system" || (message.role === "assistant" && message.status === "streaming")) continue
      if (message.role === "assistant") {
        result.push({ role: "assistant", content: message.content })
        continue
      }
      result.push({ role: "user", content: await this.userContent(message.content, message.attachments) })
    }
    return result
  }

  private async userContent(content: string, attachments: AttachmentRecord[]): Promise<string | OpenAIContentPart[]> {
    if (!attachments.length) return content
    const parts: OpenAIContentPart[] = []
    for (const attachment of attachments) {
      if (attachment.kind === "text" && attachment.textContent) {
        parts.push({ type: "text", text: `Содержимое файла «${attachment.filename}»:\n\n${attachment.textContent}` })
      } else if (attachment.kind === "audio" && attachment.transcript) {
        parts.push({ type: "text", text: `Расшифровка аудио «${attachment.filename}»:\n\n${attachment.transcript}` })
      } else if (attachment.status === "ready" && ["image", "video"].includes(attachment.kind)) {
        const object = await this.storage.get(attachment.objectKey)
        const data = (await streamToBuffer(object.body)).toString("base64")
        if (attachment.kind === "image") {
          parts.push({ type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${data}` } })
        } else {
          parts.push({ type: "input_video", input_video: { data, format: videoFormat(attachment.mimeType) } })
        }
      } else if (attachment.status === "failed") {
        parts.push({ type: "text", text: `[Вложение «${attachment.filename}» недоступно после импорта старой истории]` })
      }
    }
    if (content.trim()) parts.push({ type: "text", text: content })
    return parts
  }
}
