import type { SettingsRecord } from "../domain.js"

export interface SettingsRepository {
  get(workspaceId: string): Promise<SettingsRecord | null>
  update(workspaceId: string, settings: SettingsRecord): Promise<SettingsRecord>
}
