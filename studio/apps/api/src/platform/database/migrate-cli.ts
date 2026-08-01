import { loadConfig } from "../../config.js"
import { createPool } from "./pool.js"
import { runMigrations } from "./migrator.js"

const pool = createPool(loadConfig())
try {
  await runMigrations(pool)
  process.stdout.write("LLM Control migrations applied\n")
} finally {
  await pool.end()
}
