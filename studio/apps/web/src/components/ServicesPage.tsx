import { useQuery } from "@tanstack/react-query"
import type { ServiceEndpoint, ServiceKind } from "@ai-control-center/contracts"

import { api } from "../api/client.js"
import { CopyIcon, MenuIcon, RefreshIcon, SettingsIcon } from "./Icons.js"

interface ServicesPageProps {
  onMenu(): void
  onSettings(): void
  onToast(message: string): void
}

const kindLabel: Record<ServiceKind, string> = {
  llm: "LLM",
  asr: "ASR",
  tts: "TTS",
  "image-generation": "Изображения",
  other: "Сервис",
}

const copyText = async (value: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value)
    return
  }
  const element = document.createElement("textarea")
  element.value = value
  element.setAttribute("readonly", "")
  element.style.position = "fixed"
  element.style.opacity = "0"
  document.body.appendChild(element)
  element.select()
  const copied = document.execCommand("copy")
  element.remove()
  if (!copied) throw new Error("copy_failed")
}

function ServiceCard({ service, onToast }: { service: ServiceEndpoint; onToast(message: string): void }) {
  const copy = async () => {
    try {
      await copyText(service.endpoint)
      onToast(`Endpoint ${service.displayName} скопирован`)
    } catch {
      onToast("Не удалось скопировать endpoint")
    }
  }

  return <article className="service-card">
    <div className="service-card__header">
      <div className={`service-card__icon service-card__icon--${service.kind}`}>{kindLabel[service.kind].slice(0, 2)}</div>
      <div className="service-card__title"><h2>{service.displayName}</h2><span>{kindLabel[service.kind]}</span></div>
      <span className={`service-status service-status--${service.status}`}><i />{service.status === "online" ? "Работает" : service.status === "offline" ? "Недоступен" : "Проверка"}</span>
    </div>
    <p className="service-card__description">{service.description}</p>
    <dl className="service-meta">
      <div><dt>Адрес</dt><dd>{service.host}:{service.port}</dd></div>
      <div><dt>Протокол</dt><dd>{service.protocol}</dd></div>
      {service.model && <div className="service-meta__wide"><dt>Модель</dt><dd>{service.model}</dd></div>}
    </dl>
    <div className="service-endpoint">
      <span>Рабочий endpoint</span>
      <div><code>{service.endpoint}</code><button title="Скопировать endpoint" aria-label={`Скопировать endpoint ${service.displayName}`} onClick={() => void copy()}><CopyIcon /></button></div>
    </div>
    <div className="capabilities">{service.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div>
  </article>
}

export function ServicesPage({ onMenu, onSettings, onToast }: ServicesPageProps) {
  const services = useQuery({
    queryKey: ["services"],
    queryFn: api.services,
    refetchInterval: 15_000,
  })
  const online = services.data?.filter((service) => service.status === "online").length ?? 0

  return <main className="main main--services">
    <header className="topbar services-topbar">
      <button className="mobile-menu" onClick={onMenu}><MenuIcon /></button>
      <div className="services-topbar__title"><small>AI Control Center</small><strong>Сервисы</strong></div>
      <div className="services-topbar__meta"><span>{online} из {services.data?.length ?? 0} работают</span><button className={services.isFetching ? "is-loading" : ""} title="Обновить статусы" onClick={() => void services.refetch()}><RefreshIcon /></button><button title="Настройки" onClick={onSettings}><SettingsIcon /></button></div>
    </header>
    <section className="services-scroll">
      <div className="services-page">
        <div className="services-hero"><div><span className="eyebrow">Инфраструктура</span><h1>Подключённые сервисы</h1><p>Единый каталог адресов и совместимых API для локального AI-стека.</p></div><div className="services-summary"><strong>{services.data?.length ?? "—"}</strong><span>сервиса<br />в каталоге</span></div></div>
        {services.isLoading ? <div className="services-state">Проверяю сервисы…</div> : services.error ? <div className="services-state services-state--error"><strong>Каталог недоступен</strong><span>{services.error.message}</span><button onClick={() => void services.refetch()}>Повторить</button></div> : <div className="service-grid">{services.data?.map((service) => <ServiceCard key={service.id} service={service} onToast={onToast} />)}</div>}
      </div>
    </section>
  </main>
}
