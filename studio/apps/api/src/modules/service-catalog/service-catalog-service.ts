import type { ServiceEndpoint } from "@ai-control-center/contracts"

import type { CenterConfig } from "../../config.js"
import type { EngineRepository } from "../engines/engine-repository.js"
import type { ProviderRegistry } from "../../platform/inference/openai-provider.js"

type Fetcher = typeof fetch

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, "")

const location = (baseUrl: string) => {
  const url = new URL(baseUrl)
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
  }
}

export class ServiceCatalogService {
  constructor(
    private readonly engines: EngineRepository,
    private readonly providers: ProviderRegistry,
    private readonly config: CenterConfig["providers"],
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async list(): Promise<ServiceEndpoint[]> {
    const [gemma, asrOnline] = await Promise.all([
      this.gemmaService(),
      this.probe(`${withoutTrailingSlash(this.config.asr)}/health`),
    ])
    const asrBaseUrl = withoutTrailingSlash(this.config.asr)
    return [
      gemma,
      {
        id: "gigaam-asr",
        displayName: "GigaAM v3",
        kind: "asr",
        description: "Распознавание русской и английской речи на CPU",
        status: asrOnline ? "online" : "offline",
        ...location(asrBaseUrl),
        baseUrl: asrBaseUrl,
        endpoint: `${asrBaseUrl}/v1/audio/transcriptions`,
        protocol: "OpenAI Audio API",
        capabilities: ["audio", "speech-to-text", "ru", "en"],
        model: "GigaAM-v3 e2e RNN-T Q8_0",
      },
    ]
  }

  private async gemmaService(): Promise<ServiceEndpoint> {
    const engine = await this.engines.get("gemma4")
    const providerKey = engine?.providerKey ?? "gemma"
    const configuredBaseUrl = this.config.inference[providerKey] ?? this.config.inference.gemma
    const baseUrl = configuredBaseUrl ? withoutTrailingSlash(configuredBaseUrl) : undefined
    const health = baseUrl
      ? await this.providers.get(providerKey).health().catch(() => ({ online: false }))
      : { online: false }
    const safeBaseUrl = baseUrl || "http://127.0.0.1"
    return {
      id: engine?.id ?? "gemma4",
      displayName: engine?.displayName ?? "Gemma 4 26B A4B QAT Q4_0",
      kind: "llm",
      description: engine?.description ?? "Мультимодальная локальная языковая модель",
      status: health.online ? "online" : "offline",
      ...location(safeBaseUrl),
      baseUrl: safeBaseUrl,
      endpoint: `${safeBaseUrl}/v1/chat/completions`,
      protocol: "OpenAI Chat Completions",
      capabilities: engine?.capabilities ?? ["text", "image", "video"],
      model: engine?.model ?? "gemma-4-26b-a4b-it-qat-q4_0",
    }
  }

  private async probe(url: string): Promise<boolean> {
    try {
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(3_000) })
      return response.ok
    } catch {
      return false
    }
  }
}
