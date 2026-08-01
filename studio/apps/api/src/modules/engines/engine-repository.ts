import type { EngineRecord } from "../domain.js"

export interface EngineRepository {
  list(): Promise<EngineRecord[]>
  get(id: string): Promise<EngineRecord | null>
}
