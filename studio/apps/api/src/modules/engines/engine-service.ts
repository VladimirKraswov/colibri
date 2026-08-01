import type { Engine } from "@llm-control/contracts"

import type { ProviderRegistry } from "../../platform/inference/openai-provider.js"
import type { EngineRepository } from "./engine-repository.js"

export class EngineService {
  constructor(
    private readonly repository: EngineRepository,
    private readonly providers: ProviderRegistry,
  ) {}

  async list(): Promise<Engine[]> {
    const engines = await this.repository.list()
    return Promise.all(engines.map(async (engine) => {
      const health = await this.providers.get(engine.providerKey).health()
      return {
        id: engine.id,
        displayName: engine.displayName,
        description: engine.description,
        model: engine.model,
        contextWindow: engine.contextWindow,
        capabilities: engine.capabilities,
        status: health.online ? "online" : "offline",
        slotsIdle: health.slotsIdle,
        slotsTotal: health.slotsTotal,
      }
    }))
  }
}
