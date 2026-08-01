import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { DatabasePool } from "./pool.js"

const migrationLock = 0x434f4c49425249n

export async function runMigrations(pool: DatabasePool, directory?: string): Promise<void> {
  const migrationsDir = directory ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations")
  const client = await pool.connect()
  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLock.toString()])
    await client.query(`
      CREATE TABLE IF NOT EXISTS studio_schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    const names = (await readdir(migrationsDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()
    for (const name of names) {
      const sql = await readFile(path.join(migrationsDir, name), "utf8")
      const checksum = createHash("sha256").update(sql).digest("hex")
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM studio_schema_migrations WHERE name = $1",
        [name],
      )
      if (existing.rowCount) {
        if (existing.rows[0]?.checksum !== checksum) throw new Error(`Applied migration ${name} was modified`)
        continue
      }
      await client.query("BEGIN")
      try {
        await client.query(sql)
        await client.query(
          "INSERT INTO studio_schema_migrations(name, checksum) VALUES ($1, $2)",
          [name, checksum],
        )
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [migrationLock.toString()]).catch(() => undefined)
    client.release()
  }
}
