import type { EngineRecord } from "../../modules/domain.js"
import type { EngineRepository } from "../../modules/engines/engine-repository.js"
import type { Queryable } from "./pool.js"

interface EngineRow {
  id: string
  provider_key: string
  display_name: string
  description: string
  model: string
  context_window: number
  capabilities: string[]
}

const mapEngine = (row: EngineRow): EngineRecord => ({
  id: row.id,
  providerKey: row.provider_key,
  displayName: row.display_name,
  description: row.description,
  model: row.model,
  contextWindow: row.context_window,
  capabilities: row.capabilities,
})

export class PostgresEngineRepository implements EngineRepository {
  constructor(private readonly db: Queryable) {}

  async list(): Promise<EngineRecord[]> {
    const result = await this.db.query<EngineRow>(`
      SELECT id, provider_key, display_name, description, model, context_window, capabilities
      FROM engines WHERE enabled = true ORDER BY sort_order, id
    `)
    return result.rows.map(mapEngine)
  }

  async get(id: string): Promise<EngineRecord | null> {
    const result = await this.db.query<EngineRow>(`
      SELECT id, provider_key, display_name, description, model, context_window, capabilities
      FROM engines WHERE id = $1 AND enabled = true
    `, [id])
    return result.rows[0] ? mapEngine(result.rows[0]) : null
  }
}
