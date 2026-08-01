import { unavailable } from "../../platform/errors.js"

export interface Transcription {
  text: string
  metadata: Record<string, unknown>
}

export class SpeechService {
  constructor(private readonly baseUrl: string) {}

  async transcribe(audio: Buffer, filename: string, mimeType: string, signal?: AbortSignal): Promise<Transcription> {
    const response = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        audio: audio.toString("base64"),
        filename,
        mime_type: mimeType,
      }),
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw unavailable(typeof body.message === "string" ? body.message : `ASR returned ${response.status}`)
    if (typeof body.text !== "string" || !body.text.trim()) throw unavailable("ASR returned no recognized text")
    return { text: body.text.trim(), metadata: body }
  }
}
