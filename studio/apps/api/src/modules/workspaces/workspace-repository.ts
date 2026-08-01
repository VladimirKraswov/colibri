import type { WorkspaceRecord } from "../domain.js"

export interface WorkspaceRepository {
  getBySlug(slug: string): Promise<WorkspaceRecord | null>
}
