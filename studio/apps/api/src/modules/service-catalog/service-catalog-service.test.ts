import { describe, expect, it, vi } from "vitest"

import type { EngineRepository } from "../engines/engine-repository.js"
import { ProviderRegistry } from "../../platform/inference/openai-provider.js"
import type { InferenceProvider } from "../../platform/inference/inference-provider.js"
import { ServiceCatalogService } from "./service-catalog-service.js"

const engine = {
  id: "gemma4",
  providerKey: "gemma",
  displayName: "Gemma 4",
  description: "Мультимодальная модель",
  model: "gemma-4",
  contextWindow: 131_072,
  capabilities: ["text", "image", "video"],
}

describe("ServiceCatalogService", () => {
  it("publishes Gemma and GigaAM connection endpoints with live status", async () => {
    const repository: EngineRepository = {
      list: vi.fn(async () => [engine]),
      get: vi.fn(async () => engine),
    }
    const provider = {
      health: vi.fn(async () => ({ online: true, slotsIdle: 1, slotsTotal: 1 })),
    } as unknown as InferenceProvider
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
    const service = new ServiceCatalogService(
      repository,
      new ProviderRegistry(new Map([["gemma", provider]])),
      {
        inference: { gemma: "http://192.168.31.59:8080/api/llm/gemma4/" },
        asr: "http://192.168.31.59:8080/api/asr/",
      },
      fetcher,
    )

    const result = await service.list()

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: "gemma4",
      status: "online",
      host: "192.168.31.59",
      port: 8080,
      endpoint: "http://192.168.31.59:8080/api/llm/gemma4/v1/chat/completions",
    })
    expect(result[1]).toMatchObject({
      id: "gigaam-asr",
      status: "online",
      endpoint: "http://192.168.31.59:8080/api/asr/v1/audio/transcriptions",
    })
  })

  it("keeps an unavailable ASR visible as offline", async () => {
    const repository: EngineRepository = { list: vi.fn(async () => [engine]), get: vi.fn(async () => engine) }
    const provider = { health: vi.fn(async () => ({ online: false, slotsIdle: 0, slotsTotal: 0 })) } as unknown as InferenceProvider
    const fetcher = vi.fn(async () => { throw new Error("offline") }) as unknown as typeof fetch
    const service = new ServiceCatalogService(
      repository,
      new ProviderRegistry(new Map([["gemma", provider]])),
      { inference: { gemma: "http://gemma:8080" }, asr: "http://asr:8080" },
      fetcher,
    )

    const result = await service.list()

    expect(result.map(({ status }) => status)).toEqual(["offline", "offline"])
  })
})
