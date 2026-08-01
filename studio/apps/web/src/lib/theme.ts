import type { Theme } from "@llm-control/contracts"

export const themeStorageKey = "llm-control-theme"
const legacyThemeStorageKey = "colibri-studio-theme"

export const normalizeTheme = (value: unknown): Theme =>
  value === "ember-dark" ? "ember-dark" : "peach-light"

export const loadStoredTheme = (): Theme => {
  if (typeof window === "undefined") return "peach-light"
  try { return normalizeTheme(window.localStorage.getItem(themeStorageKey) ?? window.localStorage.getItem(legacyThemeStorageKey)) }
  catch { return "peach-light" }
}

export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme === "ember-dark" ? "dark" : "light"
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "ember-dark" ? "#171716" : "#fff7f1")
  try {
    window.localStorage.setItem(themeStorageKey, theme)
    window.localStorage.removeItem(legacyThemeStorageKey)
  } catch { /* Storage may be unavailable. */ }
}
