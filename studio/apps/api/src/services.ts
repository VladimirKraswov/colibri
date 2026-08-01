import type { ControlConfig } from "./config.js"
import { AttachmentService } from "./modules/attachments/attachment-service.js"
import { ChatService } from "./modules/chat/chat-service.js"
import type { WorkspaceRecord } from "./modules/domain.js"
import { SpeechService } from "./modules/speech/speech-service.js"
import { PostgresAttachmentRepository } from "./platform/database/postgres-attachment-repository.js"
import { PostgresConversationRepository } from "./platform/database/postgres-conversation-repository.js"
import { PostgresEngineRepository } from "./platform/database/postgres-engine-repository.js"
import { PostgresImportRepository } from "./platform/database/postgres-import-repository.js"
import { PostgresSettingsRepository } from "./platform/database/postgres-settings-repository.js"
import type { DatabasePool } from "./platform/database/pool.js"
import { OpenAIProvider, ProviderRegistry } from "./platform/inference/openai-provider.js"
import type { ObjectStorage } from "./platform/object-storage/object-storage.js"

export interface ControlServices {
  config: ControlConfig
  pool: DatabasePool
  workspace: WorkspaceRecord
  storage: ObjectStorage
  providers: ProviderRegistry
  engines: PostgresEngineRepository
  settings: PostgresSettingsRepository
  conversations: PostgresConversationRepository
  attachments: PostgresAttachmentRepository
  imports: PostgresImportRepository
  speech: SpeechService
  attachmentService: AttachmentService
  chatService: ChatService
}

export function createServices(
  config: ControlConfig,
  pool: DatabasePool,
  workspace: WorkspaceRecord,
  storage: ObjectStorage,
): ControlServices {
  const engines = new PostgresEngineRepository(pool)
  const settings = new PostgresSettingsRepository(pool)
  const conversations = new PostgresConversationRepository(pool)
  const attachments = new PostgresAttachmentRepository(pool)
  const imports = new PostgresImportRepository(pool)
  const speech = new SpeechService(config.providers.asr)
  const providers = new ProviderRegistry(new Map(
    Object.entries(config.providers.inference).map(([key, baseUrl]) => [key, new OpenAIProvider(baseUrl)]),
  ))
  const attachmentService = new AttachmentService(workspace, attachments, storage, speech)
  const chatService = new ChatService(
    workspace,
    conversations,
    attachments,
    engines,
    settings,
    storage,
    providers,
  )
  return {
    config,
    pool,
    workspace,
    storage,
    providers,
    engines,
    settings,
    conversations,
    attachments,
    imports,
    speech,
    attachmentService,
    chatService,
  }
}
