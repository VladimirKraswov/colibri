import path from "node:path"

export interface StudioConfig {
  env: "development" | "test" | "production"
  host: string
  port: number
  publicOrigin: string
  defaultWorkspace: string
  dataDir: string
  webRoot: string
  database: { url: string; poolMax: number }
  s3: {
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle: boolean
  }
  providers: { gemma: string; qwen: string; asr: string }
  logLevel: string
}

const required = (env: NodeJS.ProcessEnv, name: string, fallback?: string) => {
  const value = env[name] ?? fallback
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

const integer = (value: string, name: string, minimum: number, maximum: number) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`)
  }
  return parsed
}

const boolean = (value: string) => ["1", "true", "yes", "on"].includes(value.toLowerCase())

export function loadConfig(env: NodeJS.ProcessEnv = process.env): StudioConfig {
  const nodeEnv = (env.NODE_ENV ?? "development") as StudioConfig["env"]
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test or production")
  }
  return {
    env: nodeEnv,
    host: required(env, "STUDIO_HOST", "127.0.0.1"),
    port: integer(required(env, "STUDIO_PORT", "3000"), "STUDIO_PORT", 1, 65535),
    publicOrigin: required(env, "STUDIO_PUBLIC_ORIGIN", "http://127.0.0.1:3000"),
    defaultWorkspace: required(env, "STUDIO_DEFAULT_WORKSPACE", "local"),
    dataDir: path.resolve(required(env, "STUDIO_DATA_DIR", "./data")),
    webRoot: path.resolve(required(env, "STUDIO_WEB_ROOT", "../web/dist")),
    database: {
      url: required(env, "DATABASE_URL"),
      poolMax: integer(required(env, "DATABASE_POOL_MAX", "12"), "DATABASE_POOL_MAX", 1, 100),
    },
    s3: {
      endpoint: required(env, "S3_ENDPOINT"),
      region: required(env, "S3_REGION", "us-east-1"),
      bucket: required(env, "S3_BUCKET", "colibri-studio"),
      accessKeyId: required(env, "S3_ACCESS_KEY_ID"),
      secretAccessKey: required(env, "S3_SECRET_ACCESS_KEY"),
      forcePathStyle: boolean(required(env, "S3_FORCE_PATH_STYLE", "true")),
    },
    providers: {
      gemma: required(env, "GEMMA_BASE_URL", "http://127.0.0.1:18080"),
      qwen: required(env, "QWEN_BASE_URL", "http://127.0.0.1:8081"),
      asr: required(env, "ASR_BASE_URL", "http://127.0.0.1:18081"),
    },
    logLevel: required(env, "LOG_LEVEL", "info"),
  }
}
