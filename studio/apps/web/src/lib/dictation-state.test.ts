import { describe, expect, it } from "vitest"

import { dictationCopy, nextDictationPhase } from "./dictation-state.js"

describe("dictation state", () => {
  it("does not announce recording before the microphone is ready", () => {
    expect(nextDictationPhase("idle", "start")).toBe("initializing")
    expect(dictationCopy("initializing")).toEqual({
      label: "Подготовка микрофона…",
      hint: "пока не говорите",
    })
    expect(nextDictationPhase("initializing", "ready")).toBe("recording")
  })

  it("ignores invalid transitions and returns to idle after processing", () => {
    expect(nextDictationPhase("initializing", "stop")).toBe("initializing")
    expect(nextDictationPhase("recording", "stop")).toBe("transcribing")
    expect(nextDictationPhase("transcribing", "complete")).toBe("idle")
  })
})
