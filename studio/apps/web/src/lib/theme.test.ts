import { describe, expect, it } from "vitest"

import { normalizeTheme } from "./theme.js"

describe("normalizeTheme", () => {
  it("restores the saved dark theme", () => {
    expect(normalizeTheme("ember-dark")).toBe("ember-dark")
  })

  it("falls back to the light theme for missing or unknown values", () => {
    expect(normalizeTheme(null)).toBe("peach-light")
    expect(normalizeTheme("legacy-dark")).toBe("peach-light")
  })
})
