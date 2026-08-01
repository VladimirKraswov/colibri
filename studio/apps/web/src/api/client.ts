import type {
  Attachment,
  Bootstrap,
  ChatRequest,
  ChatStreamEvent,
  Conversation,
  LegacyLocalStorageImport,
  StudioSettings,
} from "@colibri/contracts"

interface ApiErrorBody { error?: { message?: string } }

const json = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody
    throw new Error(body.error?.message || `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  bootstrap: () => fetch("/api/v1/bootstrap").then((response) => json<Bootstrap>(response)),
  conversation: (id: string) => fetch(`/api/v1/conversations/${id}`).then((response) => json<Conversation>(response)),
  createConversation: (engineId: string) => fetch("/api/v1/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ engineId }),
  }).then((response) => json<Conversation>(response)),
  deleteConversation: async (id: string) => {
    const response = await fetch(`/api/v1/conversations/${id}`, { method: "DELETE" })
    if (!response.ok) await json(response)
  },
  updateSettings: (settings: StudioSettings) => fetch("/api/v1/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  }).then((response) => json<StudioSettings>(response)),
  upload: (file: File) => {
    const form = new FormData()
    form.append("file", file, file.name)
    return fetch("/api/v1/attachments", { method: "POST", body: form }).then((response) => json<Attachment>(response))
  },
  deleteAttachment: async (id: string) => {
    const response = await fetch(`/api/v1/attachments/${id}`, { method: "DELETE" })
    if (!response.ok) await json(response)
  },
  transcribe: (blob: Blob) => {
    const form = new FormData()
    form.append("file", blob, "dictation.wav")
    return fetch("/api/v1/transcriptions", { method: "POST", body: form })
      .then((response) => json<{ text: string }>(response))
  },
  importLegacy: (payload: LegacyLocalStorageImport) => fetch("/api/v1/import/local-storage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then((response) => json<{ duplicate: boolean; conversations: number; messages: number }>(response)),
}

export async function streamMessage(
  conversationId: string,
  request: ChatRequest,
  onEvent: (event: ChatStreamEvent | { type: "error"; error: { message: string } }) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/v1/conversations/${conversationId}/messages:stream`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(request),
    signal,
  })
  if (!response.ok || !response.body) await json(response)
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
    while (true) {
      const boundary = buffer.indexOf("\n\n")
      if (boundary < 0) break
      const event = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue
        onEvent(JSON.parse(line.slice(5).trim()) as ChatStreamEvent)
      }
    }
  }
}
