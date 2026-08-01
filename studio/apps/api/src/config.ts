import path from "node:path"

export interface ControlConfig {
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
  providers: { inference: Record<string, string>; asr: string }
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

const providerUrl = (value: unknown, name: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty URL`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL`)
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${name} must use http or https`)
  return value.replace(/\/+$/, "")
}

const inferenceProviders = (env: NodeJS.ProcessEnv): Record<string, string> => {
  const raw = env.INFERENCE_PROVIDERS_JSON
  if (!raw) {
    return {
      gemma: providerUrl(required(env, "GEMMA_BASE_URL", "http://127.0.0.1:18080"), "GEMMA_BASE_URL"),
      qwen: providerUrl(required(env, "QWEN_BASE_URL", "http://127.0.0.1:8081"), "QWEN_BASE_URL"),
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("INFERENCE_PROVIDERS_JSON must be valid JSON")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INFERENCE_PROVIDERS_JSON must be an object")
  }
  const entries = Object.entries(parsed)
  if (!entries.length) throw new Error("INFERENCE_PROVIDERS_JSON must configure at least one provider")
  return Object.fromEntries(entries.map(([key, value]) => {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key)) throw new Error(`Invalid inference provider key ${key}`)
    return [key, providerUrl(value, `Inference provider ${key}`)]
  }))
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ControlConfig {
  const nodeEnv = (env.NODE_ENV ?? "development") as ControlConfig["env"]
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test or production")
  }
  return {
    env: nodeEnv,
    host: required(env, "LLM_CONTROL_HOST", "127.0.0.1"),
    port: integer(required(env, "LLM_CONTROL_PORT", "3000"), "LLM_CONTROL_PORT", 1, 65535),
    publicOrigin: required(env, "LLM_CONTROL_PUBLIC_ORIGIN", "http://127.0.0.1:3000"),
    defaultWorkspace: required(env, "LLM_CONTROL_DEFAULT_WORKSPACE", "local"),
    dataDir: path.resolve(required(env, "LLM_CONTROL_DATA_DIR", "./data")),
    webRoot: path.resolve(required(env, "LLM_CONTROL_WEB_ROOT", "../web/dist")),
    database: {
      url: required(env, "DATABASE_URL"),
      poolMax: integer(required(env, "DATABASE_POOL_MAX", "12"), "DATABASE_POOL_MAX", 1, 100),
    },
    s3: {
      endpoint: required(env, "S3_ENDPOINT"),
      region: required(env, "S3_REGION", "us-east-1"),
      bucket: required(env, "S3_BUCKET", "llm-control"),
      accessKeyId: required(env, "S3_ACCESS_KEY_ID"),
      secretAccessKey: required(env, "S3_SECRET_ACCESS_KEY"),
      forcePathStyle: boolean(required(env, "S3_FORCE_PATH_STYLE", "true")),
    },
    providers: {
      inference: inferenceProviders(env),
      asr: providerUrl(required(env, "ASR_BASE_URL", "http://127.0.0.1:18081"), "ASR_BASE_URL"),
    },
    logLevel: required(env, "LOG_LEVEL", "info"),
  }
}
