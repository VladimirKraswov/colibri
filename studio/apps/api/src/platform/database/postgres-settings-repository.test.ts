import { describe, expect, it } from "vitest"

import { themeFromUi } from "./postgres-settings-repository.js"

describe("themeFromUi", () => {
  it("reads the supported dark theme from workspace ui settings", () => {
    expect(themeFromUi({ theme: "ember-dark", compact: true })).toBe("ember-dark")
  })

  it("keeps existing workspaces on the light theme by default", () => {
    expect(themeFromUi({})).toBe("peach-light")
    expect(themeFromUi(null)).toBe("peach-light")
    expect(themeFromUi({ theme: "unknown" })).toBe("peach-light")
  })
})
