import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Attachment, Bootstrap, Conversation, Engine, LegacyLocalStorageImport, Theme } from "@colibri/contracts"

import { api, streamMessage } from "./api/client.js"
import { Composer } from "./components/Composer.js"
import { MenuIcon, SettingsIcon } from "./components/Icons.js"
import { MessageList } from "./components/MessageList.js"
import { SettingsDialog } from "./components/SettingsDialog.js"
import { Sidebar } from "./components/Sidebar.js"
import { updateFromStream } from "./lib/stream-state.js"
import { applyTheme, loadStoredTheme } from "./lib/theme.js"

const conversationsKey = "llm-studio-conversations-v1"
const settingsKey = "llm-studio-settings-v2"
const importMarker = "colibri-studio-postgres-import-v1"

const legacyPayload = (): LegacyLocalStorageImport | null => {
  try {
    const conversations = JSON.parse(localStorage.getItem(conversationsKey) ?? "[]") as unknown
    if (!Array.isArray(conversations) || conversations.length === 0) return null
    const settings = JSON.parse(localStorage.getItem(settingsKey) ?? "{}") as unknown
    return {
      sourceVersion: "llm-studio-conversations-v1",
      conversations,
      ...(settings && typeof settings === "object" && !Array.isArray(settings) ? { settings: settings as Record<string, unknown> } : {}),
    }
  } catch { return null }
}

export function App() {
  const queryClient = useQueryClient()
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preferredEngine, setPreferredEngine] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(loadStoredTheme)
  const [toast, setToast] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const importStarted = useRef(false)
  const bottom = useRef<HTMLDivElement>(null)

  const conversation = useQuery({
    queryKey: ["conversation", selectedId],
    queryFn: () => api.conversation(selectedId!),
    enabled: Boolean(selectedId),
  })

  useEffect(() => {
    const data = bootstrap.data
    if (!data) return
    setPreferredEngine((current) => current ?? data.settings.defaultEngineId)
    if (!settingsOpen) setTheme(data.settings.theme)
    if (!selectedId && data.conversations[0]) setSelectedId(data.conversations[0].id)
  }, [bootstrap.data, selectedId, settingsOpen])

  useEffect(() => applyTheme(theme), [theme])

  useEffect(() => {
    if (!bootstrap.data || bootstrap.data.migration.localStorageImported || importStarted.current || localStorage.getItem(importMarker)) return
    const payload = legacyPayload()
    if (!payload) { localStorage.setItem(importMarker, "empty"); return }
    importStarted.current = true
    void api.importLegacy(payload).then((result) => {
      localStorage.setItem(importMarker, new Date().toISOString())
      setToast(`История перенесена в PostgreSQL: ${result.conversations} диалогов`)
      return queryClient.invalidateQueries({ queryKey: ["bootstrap"] })
    }).catch((error) => {
      importStarted.current = false
      setToast(error instanceof Error ? `Импорт не выполнен: ${error.message}` : "Импорт не выполнен")
    })
  }, [bootstrap.data, queryClient])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: streaming ? "instant" : "smooth" }) }, [conversation.data?.messages, streaming])
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(null), 5_000); return () => window.clearTimeout(timer) } }, [toast])

  const create = useMutation({ mutationFn: api.createConversation, onSuccess: async (value) => {
    queryClient.setQueryData(["conversation", value.id], value)
    setSelectedId(value.id)
    setSidebarOpen(false)
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] })
  } })
  const saveSettings = useMutation({ mutationFn: api.updateSettings, onSuccess: async (value) => {
    queryClient.setQueryData<Bootstrap>(["bootstrap"], (current) => current ? { ...current, settings: value } : current)
    setTheme(value.theme)
    setSettingsOpen(false)
    setToast("Настройки сохранены")
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] })
  }, onError: (error) => setToast(error.message) })

  const currentEngineId = conversation.data?.engineId ?? preferredEngine ?? bootstrap.data?.settings.defaultEngineId ?? "gemma4"
  const currentEngine: Engine | undefined = bootstrap.data?.engines.find((engine) => engine.id === currentEngineId)

  const newConversation = async (engineId = currentEngineId) => {
    if (streaming) return
    setDraft("")
    for (const attachment of attachments) await api.deleteAttachment(attachment.id).catch(() => undefined)
    setAttachments([])
    await create.mutateAsync(engineId)
  }

  const switchEngine = async (engineId: string) => {
    if (engineId === currentEngineId || streaming) return
    setPreferredEngine(engineId)
    const hasStarted = Boolean(conversation.data?.messages.length)
    if (hasStarted) {
      await newConversation(engineId)
      setToast("Модель изменена. Новый диалог начат с чистого листа.")
    } else if (conversation.data) {
      const oldId = conversation.data.id
      await create.mutateAsync(engineId)
      await api.deleteConversation(oldId).catch(() => undefined)
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] })
    }
  }

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    try {
      const uploaded = [] as Attachment[]
      for (const file of files.slice(0, Math.max(0, 12 - attachments.length))) uploaded.push(await api.upload(file))
      setAttachments((current) => [...current, ...uploaded])
    } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось загрузить файл") }
    finally { setUploading(false) }
  }

  const removeAttachment = async (attachment: Attachment) => {
    setAttachments((current) => current.filter((item) => item.id !== attachment.id))
    await api.deleteAttachment(attachment.id).catch(() => undefined)
  }

  const send = async () => {
    if (streaming || uploading || (!draft.trim() && !attachments.length)) return
    let target = conversation.data
    if (!target) {
      target = await create.mutateAsync(currentEngineId)
    }
    const content = draft
    const pendingAttachments = attachments
    setDraft("")
    setAttachments([])
    setStreaming(true)
    const controller = new AbortController()
    abort.current = controller
    try {
      await streamMessage(target.id, {
        content,
        attachmentIds: pendingAttachments.map((attachment) => attachment.id),
        clientRequestId: crypto.randomUUID(),
      }, (event) => {
        if (event.type === "error") { setToast(event.error.message); return }
        queryClient.setQueryData<Conversation>(["conversation", target!.id], (current) => current ? updateFromStream(current, event) : current)
      }, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) setToast(error instanceof Error ? error.message : "Ошибка генерации")
    } finally {
      abort.current = null
      setStreaming(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", target.id] }),
      ])
    }
  }

  const deleteConversation = async (id: string) => {
    if (streaming) return
    await api.deleteConversation(id)
    queryClient.removeQueries({ queryKey: ["conversation", id] })
    if (selectedId === id) setSelectedId(null)
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] })
  }

  const closeSettings = () => {
    setTheme(bootstrap.data?.settings.theme ?? "peach-light")
    setSettingsOpen(false)
  }

  if (bootstrap.isLoading) return <div className="boot"><span className="brand__mark">C</span><p>Запускаю Colibri Studio…</p></div>
  if (bootstrap.error || !bootstrap.data) return <div className="boot boot--error"><h1>Сервис временно недоступен</h1><p>{bootstrap.error?.message}</p><button onClick={() => void bootstrap.refetch()}>Повторить</button></div>
  const data: Bootstrap = bootstrap.data

  return <div className="app-shell">
    <Sidebar open={sidebarOpen} conversations={data.conversations} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setSidebarOpen(false) }} onNew={() => void newConversation()} onDelete={(id) => void deleteConversation(id)} onSettings={() => { setSidebarOpen(false); setSettingsOpen(true) }} />
    {sidebarOpen && <button className="mobile-backdrop" aria-label="Закрыть меню" onClick={() => setSidebarOpen(false)} />}
    <main className="main">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setSidebarOpen(true)}><MenuIcon /></button>
        <label className="engine-select"><span className={`status-dot ${currentEngine?.status === "online" ? "is-online" : ""}`} /><span className="engine-select__copy"><small>Модель</small><select value={currentEngineId} onChange={(event) => void switchEngine(event.target.value)} disabled={streaming || create.isPending}>
          {data.engines.map((engine) => <option key={engine.id} value={engine.id}>{engine.displayName}</option>)}
        </select></span></label>
        <div className="topbar__meta"><span>{currentEngine?.description}</span><button onClick={() => setSettingsOpen(true)}><SettingsIcon /></button></div>
      </header>
      <section className="chat-scroll">
        {conversation.isLoading && selectedId ? <div className="chat-loading">Загружаю диалог…</div> : <MessageList messages={conversation.data?.messages ?? []} engineName={currentEngine?.displayName ?? "Модель"} streaming={streaming} />}
        <div ref={bottom} />
      </section>
      <Composer value={draft} attachments={attachments} uploading={uploading} streaming={streaming} disabled={create.isPending} onChange={setDraft} onFiles={(files) => void uploadFiles(files)} onRemove={(attachment) => void removeAttachment(attachment)} onSend={() => void send()} onStop={() => abort.current?.abort()} onError={setToast} />
    </main>
    <SettingsDialog open={settingsOpen} settings={data.settings} engines={data.engines} saving={saveSettings.isPending} onThemePreview={setTheme} onClose={closeSettings} onSave={(value) => saveSettings.mutate(value)} />
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
}
