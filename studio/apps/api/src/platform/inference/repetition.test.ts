import { describe, expect, it } from "vitest"

import { trimRepeatedSuffix } from "./repetition.js"

describe("trimRepeatedSuffix", () => {
  it("cuts an exact long generation loop at its first repeated block", () => {
    const block = Array.from({ length: 80 }, (_, index) => `часть-${index.toString().padStart(3, "0")};`).join("")
    const result = trimRepeatedSuffix(`Начало. ${block}${block}`)
    expect(result.stopped).toBe(true)
    expect(result.content).toBe(`Начало. ${block}`.trimEnd())
  })

  it("leaves ordinary prose unchanged", () => {
    expect(trimRepeatedSuffix("Короткий нормальный ответ.")).toEqual({ content: "Короткий нормальный ответ.", stopped: false })
  })
})
