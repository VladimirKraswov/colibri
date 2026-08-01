import type { LegacyLocalStorageImport } from "@llm-control/contracts"

export interface ImportResult {
  duplicate: boolean
  conversations: number
  messages: number
}

export interface ImportRepository {
  wasImported(workspaceId: string): Promise<boolean>
  importLegacy(workspaceId: string, fingerprint: string, payload: LegacyLocalStorageImport): Promise<ImportResult>
}
