import type { SettingsRecord } from "../../modules/domain.js"
import type { SettingsRepository } from "../../modules/settings/settings-repository.js"
import type { Queryable } from "./pool.js"

interface SettingsRow {
  default_engine_id: string
  system_prompt: string
  temperature: number
  top_p: number
  top_k: number
  min_p: number
  presence_penalty: number
  repeat_penalty: number
  max_tokens: number
  thinking_enabled: boolean
  auto_compress: boolean
  compression_threshold: number
}

const mapSettings = (row: SettingsRow): SettingsRecord => ({
  defaultEngineId: row.default_engine_id,
  systemPrompt: row.system_prompt,
  temperature: row.temperature,
  topP: row.top_p,
  topK: row.top_k,
  minP: row.min_p,
  presencePenalty: row.presence_penalty,
  repeatPenalty: row.repeat_penalty,
  maxTokens: row.max_tokens,
  thinkingEnabled: row.thinking_enabled,
  autoCompress: row.auto_compress,
  compressionThreshold: row.compression_threshold,
})

const columns = `default_engine_id, system_prompt, temperature, top_p, top_k, min_p,
  presence_penalty, repeat_penalty, max_tokens, thinking_enabled, auto_compress, compression_threshold`

export class PostgresSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Queryable) {}

  async get(workspaceId: string): Promise<SettingsRecord | null> {
    const result = await this.db.query<SettingsRow>(`SELECT ${columns} FROM workspace_settings WHERE workspace_id = $1`, [workspaceId])
    return result.rows[0] ? mapSettings(result.rows[0]) : null
  }

  async update(workspaceId: string, settings: SettingsRecord): Promise<SettingsRecord> {
    const result = await this.db.query<SettingsRow>(`
      UPDATE workspace_settings SET
        default_engine_id = $2, system_prompt = $3, temperature = $4, top_p = $5,
        top_k = $6, min_p = $7, presence_penalty = $8, repeat_penalty = $9,
        max_tokens = $10, thinking_enabled = $11, auto_compress = $12,
        compression_threshold = $13, updated_at = now()
      WHERE workspace_id = $1
      RETURNING ${columns}
    `, [
      workspaceId, settings.defaultEngineId, settings.systemPrompt, settings.temperature,
      settings.topP, settings.topK, settings.minP, settings.presencePenalty,
      settings.repeatPenalty, settings.maxTokens, settings.thinkingEnabled,
      settings.autoCompress, settings.compressionThreshold,
    ])
    if (!result.rows[0]) throw new Error("Workspace settings row is missing")
    return mapSettings(result.rows[0])
  }
}
