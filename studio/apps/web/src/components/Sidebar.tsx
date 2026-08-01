import type { ConversationSummary } from "@ai-control-center/contracts"

import { ChatIcon, PlusIcon, ServicesIcon, SettingsIcon, TrashIcon } from "./Icons.js"

export type CenterView = "chat" | "services"

interface SidebarProps {
  open: boolean
  activeView: CenterView
  conversations: ConversationSummary[]
  selectedId: string | null
  onSelect(id: string): void
  onNew(): void
  onDelete(id: string): void
  onSettings(): void
  onView(view: CenterView): void
}

const relative = (value: string) => {
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return "Сегодня"
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(date)
}

export function Sidebar({ open, activeView, conversations, selectedId, onSelect, onNew, onDelete, onSettings, onView }: SidebarProps) {
  return <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
    <div className="brand"><span className="brand__mark">A</span><span>AI Control Center</span></div>
    <nav className="primary-nav" aria-label="Разделы">
      <button className={activeView === "chat" ? "is-active" : ""} onClick={() => onView("chat")}><ChatIcon /><span>Чат</span></button>
      <button className={activeView === "services" ? "is-active" : ""} onClick={() => onView("services")}><ServicesIcon /><span>Сервисы</span></button>
    </nav>
    {activeView === "chat" ? <>
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
    </> : <div className="sidebar__context"><strong>Центр управления</strong><span>Единая точка подключения локальных AI-сервисов.</span></div>}
    <button className="sidebar__settings" onClick={onSettings}><SettingsIcon />Настройки</button>
  </aside>
}
