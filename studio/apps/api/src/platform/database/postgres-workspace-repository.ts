import type { WorkspaceRecord } from "../../modules/domain.js"
import type { WorkspaceRepository } from "../../modules/workspaces/workspace-repository.js"
import type { Queryable } from "./pool.js"

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: Queryable) {}

  async getBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const result = await this.db.query<WorkspaceRecord>(
      "SELECT id, slug, name FROM workspaces WHERE slug = $1",
      [slug],
    )
    return result.rows[0] ?? null
  }
}
