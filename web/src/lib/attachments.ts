export type AttachmentKind = "image" | "video" | "audio" | "text"

export interface ChatAttachment {
  id: string
  name: string
  mimeType: string
  kind: AttachmentKind
  size: number
  data?: string
  text?: string
  transcript?: string
  asr?: {
    duration_seconds?: number
    processing_seconds?: number
    realtime_factor?: number
    model?: string
  }
}

const textExtensions = new Set([
  "txt", "md", "markdown", "json", "jsonl", "csv", "tsv", "log",
  "yaml", "yml", "xml", "html", "htm", "css", "js", "jsx", "ts",
  "tsx", "py", "sh", "bash", "zsh", "c", "cc", "cpp", "h", "hpp",
  "rs", "go", "java", "kt", "sql", "ini", "toml", "conf", "env",
])

const audioExtensions = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "wma"])

export const attachmentLimits: Record<AttachmentKind, number> = {
  image: 12 * 1024 ** 2,
  video: 32 * 1024 ** 2,
  audio: 24 * 1024 ** 2,
  text: 256 * 1024,
}

export const attachmentAccept = [
  "image/*", "video/*", "audio/*", "text/*", ".md", ".markdown", ".json",
  ".jsonl", ".csv", ".tsv", ".log", ".yaml", ".yml", ".xml", ".html",
  ".css", ".js", ".jsx", ".ts", ".tsx", ".py", ".sh", ".c", ".cpp",
  ".h", ".hpp", ".rs", ".go", ".java", ".kt", ".sql", ".ini", ".toml",
  ".conf", ".env",
].join(",")

const id = () => {
  try { return crypto.randomUUID() } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }
}

const extension = (file: File) => file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : ""

export function attachmentKind(file: File): AttachmentKind | null {
  const mime = file.type.toLowerCase()
  const ext = extension(file)
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/") || audioExtensions.has(ext)) return "audio"
  if (
    mime.startsWith("text/") ||
    ["application/json", "application/xml", "application/x-yaml"].includes(mime) ||
    textExtensions.has(ext)
  ) return "text"
  return null
}

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "")
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
  reader.readAsDataURL(file)
})

export async function attachmentFromFile(file: File): Promise<ChatAttachment> {
  const kind = attachmentKind(file)
  if (!kind) throw new Error(`${file.name}: unsupported file type`)
  if (file.size > attachmentLimits[kind]) {
    const limit = kind === "text" ? "256 KB" : `${Math.round(attachmentLimits[kind] / 1024 ** 2)} MB`
    throw new Error(`${file.name}: exceeds the ${limit} limit`)
  }
  return {
    id: id(),
    name: file.name,
    mimeType: file.type || (kind === "text" ? "text/plain" : "application/octet-stream"),
    kind,
    size: file.size,
    ...(kind === "text" ? { text: (await file.text()).replace(/^\uFEFF/, "") } : { data: await fileToBase64(file) }),
  }
}

export async function transcribeAttachment(attachment: ChatAttachment): Promise<ChatAttachment> {
  if (attachment.kind !== "audio" || !attachment.data) return attachment
  const response = await fetch("/api/asr/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: attachment.data,
      filename: attachment.name,
      mime_type: attachment.mimeType,
    }),
  })
  const body = await response.json().catch(() => ({})) as {
    text?: string
    message?: string
    duration_seconds?: number
    processing_seconds?: number
    realtime_factor?: number
    model?: string
  }
  if (!response.ok) throw new Error(body.message || `Speech recognition failed (${response.status})`)
  if (!body.text?.trim()) throw new Error(`No speech recognized in ${attachment.name}`)
  return { ...attachment, transcript: body.text.trim(), asr: body }
}

export function apiMessageContent(content: string, attachments: ChatAttachment[] = []) {
  if (!attachments.length) return content
  type Part =
    | { type: "image_url"; image_url: { url: string } }
    | { type: "input_video"; input_video: { data: string; format: string } }
    | { type: "text"; text: string }
  const parts: Part[] = []
  attachments.forEach((attachment) => {
    if (attachment.kind === "image" && attachment.data) {
      parts.push({ type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` } })
    } else if (attachment.kind === "video" && attachment.data) {
      parts.push({
        type: "input_video",
        input_video: {
          data: attachment.data,
          format: attachment.mimeType.includes("mp4") ? "mp4" : attachment.mimeType.includes("ogg") ? "ogg" : "auto",
        },
      })
    } else if (attachment.kind === "audio" && attachment.transcript) {
      parts.push({ type: "text", text: `Transcript of audio file “${attachment.name}” (GigaAM-v3 RNN-T Q8):\n\n${attachment.transcript}` })
    } else if (attachment.kind === "text" && attachment.text) {
      parts.push({ type: "text", text: `Contents of text file “${attachment.name}”:\n\n${attachment.text}` })
    }
  })
  if (content.trim()) parts.push({ type: "text", text: content })
  return parts
}

const mergeChunks = (chunks: Float32Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(total)
  let offset = 0
  chunks.forEach((chunk) => { merged.set(chunk, offset); offset += chunk.length })
  return merged
}

const resampleTo16k = async (pcm: Float32Array, sourceRate: number) => {
  if (sourceRate === 16000) return pcm
  const length = Math.max(1, Math.ceil(pcm.length * 16000 / sourceRate))
  const context = new OfflineAudioContext(1, length, 16000)
  const buffer = context.createBuffer(1, pcm.length, sourceRate)
  buffer.copyToChannel(new Float32Array(pcm), 0)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
  return (await context.startRendering()).getChannelData(0).slice()
}

const pcm16Wav = (pcm: Float32Array) => {
  const bytes = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(bytes)
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, "RIFF"); view.setUint32(4, 36 + pcm.length * 2, true); text(8, "WAVE"); text(12, "fmt ")
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, "data"); view.setUint32(40, pcm.length * 2, true)
  pcm.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 32768 : clamped * 32767, true)
  })
  return new Blob([view], { type: "audio/wav" })
}

export interface PcmRecorder {
  stop(): Promise<Blob>
  cancel(): void
}

export async function createPcmRecorder(): Promise<PcmRecorder> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access requires the HTTPS interface")
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const context = new AudioContext({ latencyHint: "interactive" })
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  const silent = context.createGain()
  const chunks: Float32Array[] = []
  let stopped = false
  silent.gain.value = 0
  processor.onaudioprocess = (event) => { if (!stopped) chunks.push(event.inputBuffer.getChannelData(0).slice()) }
  source.connect(processor); processor.connect(silent); silent.connect(context.destination)

  const close = () => {
    stopped = true
    processor.onaudioprocess = null
    stream.getTracks().forEach((track) => track.stop())
    try { source.disconnect(); processor.disconnect(); silent.disconnect() } catch { /* already disconnected */ }
  }
  return {
    async stop() {
      if (stopped) throw new Error("Recording already stopped")
      close()
      const rate = context.sampleRate
      await context.close()
      return pcm16Wav(await resampleTo16k(mergeChunks(chunks), rate))
    },
    cancel() { if (!stopped) close(); void context.close() },
  }
}
