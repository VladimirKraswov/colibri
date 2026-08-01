import { describe, expect, it } from "vitest"

import { loadConfig } from "./config.js"

const baseEnv = {
  DATABASE_URL: "postgresql://llm_control:test@127.0.0.1/llm_control",
  S3_ENDPOINT: "http://minio:9000",
  S3_ACCESS_KEY_ID: "test-key",
  S3_SECRET_ACCESS_KEY: "test-secret",
}

describe("loadConfig inference providers", () => {
  it("uses the LLM Control service namespace", () => {
    const config = loadConfig({
      ...baseEnv,
      LLM_CONTROL_HOST: "0.0.0.0",
      LLM_CONTROL_PORT: "3030",
    })
    expect(config.host).toBe("0.0.0.0")
    expect(config.port).toBe(3030)
    expect(config.s3.bucket).toBe("llm-control")
  })

  it("keeps the two-provider compatibility configuration", () => {
    const config = loadConfig({
      ...baseEnv,
      GEMMA_BASE_URL: "http://cpu-inference:18080/",
      QWEN_BASE_URL: "http://cpu-inference:8081/",
    })
    expect(config.providers.inference).toEqual({
      gemma: "http://cpu-inference:18080",
      qwen: "http://cpu-inference:8081",
    })
  })

  it("accepts an extensible provider map for remote inference nodes", () => {
    const config = loadConfig({
      ...baseEnv,
      INFERENCE_PROVIDERS_JSON: JSON.stringify({
        gemma: "http://cpu-inference:8080/api/llm/gemma4",
        qwen: "http://cpu-inference:8080/api/llm/legacy",
        vlm5090: "http://vm5090:8000/v1-compatible",
      }),
      ASR_BASE_URL: "http://cpu-inference:8080/api/asr",
    })
    expect(config.providers.inference.vlm5090).toBe("http://vm5090:8000/v1-compatible")
    expect(config.providers.asr).toBe("http://cpu-inference:8080/api/asr")
  })

  it("rejects unsupported provider protocols", () => {
    expect(() => loadConfig({
      ...baseEnv,
      INFERENCE_PROVIDERS_JSON: JSON.stringify({ gemma: "file:///tmp/model" }),
    })).toThrow("must use http or https")
  })
})
