import { buildApp } from "./app.js"
import { loadConfig } from "./config.js"
import { runMigrations } from "./platform/database/migrator.js"
import { createPool } from "./platform/database/pool.js"
import { PostgresWorkspaceRepository } from "./platform/database/postgres-workspace-repository.js"
import { S3ObjectStorage } from "./platform/object-storage/s3-object-storage.js"
import { createServices } from "./services.js"

const config = loadConfig()
const pool = createPool(config)

try {
  await runMigrations(pool)
  const workspace = await new PostgresWorkspaceRepository(pool).getBySlug(config.defaultWorkspace)
  if (!workspace) throw new Error(`Workspace ${config.defaultWorkspace} was not created by migrations`)
  const storage = new S3ObjectStorage(config.s3)
  await storage.ensureReady()
  const app = await buildApp(createServices(config, pool, workspace, storage))

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down")
    await app.close()
    process.exit(0)
  }
  process.once("SIGINT", () => void shutdown("SIGINT"))
  process.once("SIGTERM", () => void shutdown("SIGTERM"))
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  console.error(error)
  await pool.end().catch(() => undefined)
  process.exit(1)
}
