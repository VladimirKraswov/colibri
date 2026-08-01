export type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_video"; input_video: { data: string; format: string } }

export interface ProviderMessage {
  role: "system" | "user" | "assistant"
  content: string | OpenAIContentPart[]
}

export interface GenerationOptions {
  model: string
  temperature: number
  topP: number
  topK: number
  minP: number
  presencePenalty: number
  repeatPenalty: number
  maxTokens: number
  thinkingEnabled: boolean
}

export type ProviderChunk =
  | { type: "delta"; content?: string; reasoning?: string }
  | {
      type: "done"
      usage?: { promptTokens?: number; completionTokens?: number }
      finishReason?: string
      tokensPerSecond?: number
    }

export interface ProviderHealth {
  online: boolean
  slotsIdle: number
  slotsTotal: number
}

export interface InferenceProvider {
  health(): Promise<ProviderHealth>
  stream(messages: ProviderMessage[], options: GenerationOptions, signal: AbortSignal): AsyncGenerator<ProviderChunk>
}
