import type { ConversationSummary } from "@llm-control/contracts"

import { PlusIcon, SettingsIcon, TrashIcon } from "./Icons.js"

interface SidebarProps {
  open: boolean
  conversations: ConversationSummary[]
  selectedId: string | null
  onSelect(id: string): void
  onNew(): void
  onDelete(id: string): void
  onSettings(): void
}

const relative = (value: string) => {
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return "Сегодня"
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(date)
}

export function Sidebar({ open, conversations, selectedId, onSelect, onNew, onDelete, onSettings }: SidebarProps) {
  return <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
    <div className="brand"><span className="brand__mark">L</span><span>LLM Control</span></div>
    <button className="new-chat" onClick={onNew}><PlusIcon />Новый диалог</button>
    <div className="history">
      <div className="history__label">Диалоги</div>
      {conversations.length === 0 && <div className="history__empty">История появится здесь</div>}
      {conversations.map((conversation) => <div className={`history__item ${selectedId === conversation.id ? "is-active" : ""}`} key={conversation.id}>
        <button className="history__select" onClick={() => onSelect(conversation.id)}>
          <span>{conversation.title}</span><small>{relative(conversation.updatedAt)} · {conversation.messageCount}</small>
        </button>
        <button className="history__delete" title="Удалить" onClick={() => onDelete(conversation.id)}><TrashIcon /></button>
      </div>)}
    </div>
    <button className="sidebar__settings" onClick={onSettings}><SettingsIcon />Настройки</button>
  </aside>
}
