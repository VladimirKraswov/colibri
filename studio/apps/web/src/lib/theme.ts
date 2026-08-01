import type { Theme } from "@ai-control-center/contracts"

export const themeStorageKey = "ai-control-center-theme"
const legacyThemeStorageKeys = ["llm-control-theme", "colibri-studio-theme"]

export const normalizeTheme = (value: unknown): Theme =>
  value === "ember-dark" ? "ember-dark" : "peach-light"

export const loadStoredTheme = (): Theme => {
  if (typeof window === "undefined") return "peach-light"
  try {
    const stored = window.localStorage.getItem(themeStorageKey)
      ?? legacyThemeStorageKeys.map((key) => window.localStorage.getItem(key)).find(Boolean)
    return normalizeTheme(stored)
  }
  catch { return "peach-light" }
}

export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme === "ember-dark" ? "dark" : "light"
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "ember-dark" ? "#171716" : "#fff7f1")
  try {
    window.localStorage.setItem(themeStorageKey, theme)
    legacyThemeStorageKeys.forEach((key) => window.localStorage.removeItem(key))
  } catch { /* Storage may be unavailable. */ }
}
