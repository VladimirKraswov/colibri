import type { LegacyLocalStorageImport } from "@ai-control-center/contracts"

export interface ImportResult {
  duplicate: boolean
  conversations: number
  messages: number
}

export interface ImportRepository {
  wasImported(workspaceId: string): Promise<boolean>
  importLegacy(workspaceId: string, fingerprint: string, payload: LegacyLocalStorageImport): Promise<ImportResult>
}
