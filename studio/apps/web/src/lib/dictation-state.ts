export type DictationPhase = "idle" | "initializing" | "recording" | "transcribing"

export type DictationEvent = "start" | "ready" | "stop" | "complete" | "fail"

const transitions: Record<DictationPhase, Partial<Record<DictationEvent, DictationPhase>>> = {
  idle: { start: "initializing" },
  initializing: { ready: "recording", fail: "idle" },
  recording: { stop: "transcribing", fail: "idle" },
  transcribing: { complete: "idle", fail: "idle" },
}

export const nextDictationPhase = (phase: DictationPhase, event: DictationEvent): DictationPhase =>
  transitions[phase][event] ?? phase

export const dictationCopy = (phase: Exclude<DictationPhase, "idle">) => {
  if (phase === "initializing") return {
    label: "Подготовка микрофона…",
    hint: "пока не говорите",
  }
  if (phase === "recording") return {
    label: "Готово — говорите",
    hint: "нажмите микрофон, чтобы завершить",
  }
  return {
    label: "Распознаю речь…",
    hint: "можно продолжить после обработки",
  }
}
