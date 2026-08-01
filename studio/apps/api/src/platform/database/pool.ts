import pg from "pg"

import type { CenterConfig } from "../../config.js"

const { Pool } = pg

export type DatabasePool = pg.Pool
export type DatabaseClient = pg.PoolClient
export type Queryable = Pick<pg.Pool, "query"> | Pick<pg.PoolClient, "query">

export function createPool(config: CenterConfig): DatabasePool {
  return new Pool({
    connectionString: config.database.url,
    max: config.database.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "ai-control-center",
  })
}

export async function inTransaction<T>(pool: DatabasePool, work: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await work(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
