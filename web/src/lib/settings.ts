// Small localStorage-backed settings persistence. Keys share the `arisa_`
// prefix used elsewhere (e.g. the chat session id). Reads and writes are
// defensive so a corrupt value or unavailable storage (private mode, quota)
// never breaks startup — the settings just fall back to defaults.
export const SETTINGS_KEYS = {
  voiceVolume: "arisa_voice_volume",
  voiceMuted: "arisa_voice_muted",
  bgmEnabled: "arisa_bgm_enabled",
  bgmVolume: "arisa_bgm_volume",
} as const

export function readSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore — settings persistence is best-effort.
  }
}
