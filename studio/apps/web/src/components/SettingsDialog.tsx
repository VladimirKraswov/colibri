import { useEffect, useState } from "react"
import type { Engine, StudioSettings, Theme } from "@colibri/contracts"

import { CloseIcon } from "./Icons.js"

interface SettingsDialogProps {
  open: boolean
  settings: StudioSettings
  engines: Engine[]
  saving: boolean
  onThemePreview(theme: Theme): void
  onClose(): void
  onSave(value: StudioSettings): void
}

export function SettingsDialog({ open, settings, engines, saving, onThemePreview, onClose, onSave }: SettingsDialogProps) {
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings, open])
  if (!open) return null
  const number = (key: keyof StudioSettings, value: string) => setDraft({ ...draft, [key]: Number(value) })
  const selectTheme = (theme: Theme) => {
    setDraft({ ...draft, theme })
    onThemePreview(theme)
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog" role="dialog" aria-modal="true" aria-label="Настройки">
      <div className="dialog__header"><div><h2>Настройки</h2><p>Параметры применяются ко всем новым ответам.</p></div><button onClick={onClose}><CloseIcon /></button></div>
      <div className="settings-grid">
        <section className="appearance field--wide" aria-labelledby="appearance-label">
          <span id="appearance-label" className="field-label">Оформление</span>
          <div className="theme-picker" role="radiogroup" aria-label="Тема интерфейса">
            <button type="button" role="radio" aria-checked={draft.theme === "peach-light"} className={`theme-option ${draft.theme === "peach-light" ? "is-active" : ""}`} onClick={() => selectTheme("peach-light")}>
              <span className="theme-preview theme-preview--light" aria-hidden="true"><i /><b /><em /></span>
              <span className="theme-option__copy"><strong>Персиковый свет</strong><small>Тёплая и воздушная</small></span>
              <span className="theme-option__check" aria-hidden="true">✓</span>
            </button>
            <button type="button" role="radio" aria-checked={draft.theme === "ember-dark"} className={`theme-option ${draft.theme === "ember-dark" ? "is-active" : ""}`} onClick={() => selectTheme("ember-dark")}>
              <span className="theme-preview theme-preview--dark" aria-hidden="true"><i /><b /><em /></span>
              <span className="theme-option__copy"><strong>Тёмный графит</strong><small>Контрастный с огненным акцентом</small></span>
              <span className="theme-option__check" aria-hidden="true">✓</span>
            </button>
          </div>
        </section>
        <label className="field field--wide">Модель по умолчанию<select value={draft.defaultEngineId} onChange={(event) => setDraft({ ...draft, defaultEngineId: event.target.value })}>
          {engines.map((engine) => <option value={engine.id} key={engine.id}>{engine.displayName}</option>)}
        </select></label>
        <label className="field field--wide">Системная инструкция<textarea rows={5} value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} /></label>
        <label className="field">Температура<input type="number" min="0" max="2" step="0.05" value={draft.temperature} onChange={(event) => number("temperature", event.target.value)} /></label>
        <label className="field">Top P<input type="number" min="0" max="1" step="0.05" value={draft.topP} onChange={(event) => number("topP", event.target.value)} /></label>
        <label className="field">Top K<input type="number" min="0" step="1" value={draft.topK} onChange={(event) => number("topK", event.target.value)} /></label>
        <label className="field">Min P<input type="number" min="0" max="1" step="0.01" value={draft.minP} onChange={(event) => number("minP", event.target.value)} /></label>
        <label className="field">Presence penalty<input type="number" min="-2" max="2" step="0.1" value={draft.presencePenalty} onChange={(event) => number("presencePenalty", event.target.value)} /></label>
        <label className="field">Repeat penalty<input type="number" min="0" step="0.05" value={draft.repeatPenalty} onChange={(event) => number("repeatPenalty", event.target.value)} /></label>
        <label className="field">Максимум токенов<input type="number" min="1" max="32768" step="1" value={draft.maxTokens} onChange={(event) => number("maxTokens", event.target.value)} /></label>
        <label className="toggle"><input type="checkbox" checked={draft.thinkingEnabled} onChange={(event) => setDraft({ ...draft, thinkingEnabled: event.target.checked })} /><span />Показывать рассуждение модели</label>
      </div>
      <div className="dialog__footer"><button className="button button--quiet" onClick={onClose}>Отмена</button><button className="button button--primary" disabled={saving} onClick={() => onSave(draft)}>{saving ? "Сохраняю…" : "Сохранить"}</button></div>
    </div>
  </div>
}
