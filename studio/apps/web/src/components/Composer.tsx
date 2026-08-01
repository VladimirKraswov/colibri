import { useRef, useState } from "react"
import type { Attachment } from "@llm-control/contracts"

import { api } from "../api/client.js"
import { createPcmRecorder, type PcmRecorder } from "../lib/recorder.js"
import { CloseIcon, FileIcon, MicIcon, PaperclipIcon, SendIcon, StopIcon } from "./Icons.js"

interface ComposerProps {
  value: string
  attachments: Attachment[]
  uploading: boolean
  streaming: boolean
  disabled: boolean
  onChange(value: string): void
  onFiles(files: File[]): void
  onRemove(attachment: Attachment): void
  onSend(): void
  onStop(): void
  onError(message: string): void
}

const accept = "image/*,video/*,audio/*,text/*,.md,.json,.jsonl,.csv,.tsv,.log,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.sh,.c,.cpp,.h,.hpp,.rs,.go,.java,.kt,.sql,.ini,.toml,.conf,.env"

export function Composer(props: ComposerProps) {
  const input = useRef<HTMLInputElement>(null)
  const recorder = useRef<PcmRecorder | null>(null)
  const startedOnPointerDown = useRef(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [spectrum, setSpectrum] = useState(() => Array.from({ length: 16 }, () => 0.06))

  const startRecording = async () => {
    if (recording || recorder.current || transcribing) return
    try {
      recorder.current = await createPcmRecorder(setSpectrum)
      setRecording(true)
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "Не удалось включить микрофон")
    }
  }
  const stopRecording = async () => {
    const active = recorder.current
    if (!active) return
    recorder.current = null
    setRecording(false)
    setTranscribing(true)
    try {
      const { text } = await api.transcribe(await active.stop())
      props.onChange(`${props.value}${props.value.trim() ? " " : ""}${text}`)
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "Не удалось распознать речь")
    } finally {
      setTranscribing(false)
      setSpectrum(Array.from({ length: 16 }, () => 0.06))
    }
  }

  return <div className="composer-wrap">
    <div className={`composer ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => {
      event.preventDefault(); setDragging(false); props.onFiles(Array.from(event.dataTransfer.files))
    }}>
      {dragging && <div className="drop-hint">Отпустите файлы, чтобы добавить их</div>}
      {props.attachments.length > 0 && <div className="composer__attachments">{props.attachments.map((attachment) => <div className="attachment-chip" key={attachment.id}>
        {attachment.kind === "image" ? <img src={attachment.contentUrl} alt="" /> : <FileIcon />}
        <span><b>{attachment.filename}</b><small>{attachment.kind === "audio" && attachment.transcript ? "Речь распознана" : attachment.kind}</small></span>
        <button onClick={() => props.onRemove(attachment)}><CloseIcon /></button>
      </div>)}</div>}
      {recording && <div className="dictation">
        <span className="dictation__dot" /><span>Слушаю</span>
        <div className="spectrum" aria-label="Уровень микрофона">{spectrum.map((value, index) => <i key={index} style={{ height: `${Math.round(4 + value * 24)}px` }} />)}</div>
        <span className="dictation__hint">нажмите микрофон, чтобы завершить</span>
      </div>}
      <textarea
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); props.onSend() } }}
        placeholder={recording ? "Говорите…" : "Сообщение для модели"}
        rows={1}
      />
      <div className="composer__toolbar">
        <div className="composer__tools">
          <input ref={input} hidden type="file" multiple accept={accept} onChange={(event) => { props.onFiles(Array.from(event.target.files ?? [])); event.target.value = "" }} />
          <button title="Добавить файл" disabled={props.uploading || props.disabled} onClick={() => input.current?.click()}><PaperclipIcon /></button>
          <button
            className={recording ? "is-recording" : ""}
            title={recording ? "Завершить диктовку" : "Диктовка"}
            disabled={transcribing || props.disabled}
            onPointerDown={() => {
              if (!recording && !recorder.current) { startedOnPointerDown.current = true; void startRecording() }
            }}
            onClick={() => {
              if (startedOnPointerDown.current) { startedOnPointerDown.current = false; return }
              if (recording) void stopRecording(); else void startRecording()
            }}
          >{recording ? <StopIcon /> : <MicIcon />}</button>
          {(props.uploading || transcribing) && <span className="composer__status">{transcribing ? "Распознаю речь…" : "Загружаю…"}</span>}
        </div>
        {props.streaming
          ? <button className="send-button is-stop" title="Остановить" onClick={props.onStop}><StopIcon /></button>
          : <button className="send-button" title="Отправить" disabled={props.disabled || props.uploading || (!props.value.trim() && !props.attachments.length)} onClick={props.onSend}><SendIcon /></button>}
      </div>
    </div>
    <div className="composer-note">Ответ может содержать неточности. Важную информацию стоит проверить.</div>
  </div>
}
