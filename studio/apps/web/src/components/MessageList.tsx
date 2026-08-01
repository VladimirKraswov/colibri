import type { Message } from "@ai-control-center/contracts"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface MessageListProps { messages: Message[]; engineName: string; streaming: boolean }

const formatSize = (bytes: number) => bytes < 1024 ** 2 ? `${Math.ceil(bytes / 1024)} КБ` : `${(bytes / 1024 ** 2).toFixed(1)} МБ`

export function MessageList({ messages, engineName, streaming }: MessageListProps) {
  if (!messages.length) return <div className="welcome">
    <div className="welcome__badge">L</div>
    <h1>Чем займёмся?</h1>
    <p>{engineName} готова к диалогу. Можно добавить изображение, видео, аудио или текстовый файл.</p>
    <div className="suggestions">
      <span>Разобрать документ</span><span>Проанализировать изображение</span><span>Помочь с кодом</span>
    </div>
  </div>

  return <div className="messages">
    {messages.map((message) => <article className={`message message--${message.role}`} key={message.id}>
      <div className="message__avatar">{message.role === "user" ? "В" : "AI"}</div>
      <div className="message__body">
        <div className="message__author">{message.role === "user" ? "Вы" : engineName}</div>
        {message.attachments.length > 0 && <div className="message__attachments">
          {message.attachments.map((attachment) => <a key={attachment.id} href={attachment.contentUrl} target="_blank" rel="noreferrer">
            {attachment.kind === "image" && attachment.status === "ready"
              ? <img src={attachment.contentUrl} alt={attachment.filename} />
              : <span className="attachment__icon">{attachment.kind === "audio" ? "◖))" : attachment.kind === "video" ? "▶" : "TXT"}</span>}
            <span><b>{attachment.filename}</b><small>{formatSize(attachment.sizeBytes)}</small></span>
          </a>)}
        </div>}
        {message.reasoning && <details className="reasoning"><summary>Ход рассуждений</summary><p>{message.reasoning}</p></details>}
        <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>{message.status === "streaming" && <span className="cursor" />}</div>
        {message.stats && <div className="message__stats">
          {message.stats.tokensPerSecond !== undefined && <span>{message.stats.tokensPerSecond.toFixed(1)} ток/с</span>}
          {message.stats.completionTokens !== undefined && <span>{message.stats.completionTokens} токенов</span>}
          {message.stats.elapsedSeconds !== undefined && <span>{message.stats.elapsedSeconds.toFixed(1)} с</span>}
        </div>}
        {message.status === "failed" && <div className="message__error">Ответ не был завершён</div>}
      </div>
    </article>)}
    {streaming && <div className="sr-only" aria-live="polite">Модель отвечает</div>}
  </div>
}
