import { create } from "zustand"

interface AvatarState {
  audio_base64: string
  audio_mime: string
  message: string
  transcript: string
  visemes: {
    metadata: { duration: number }
    mouthCues: { start: number; end: number; value: string }[]
  }
  animation: string
  expression: Record<string, number>
}

export interface AnswerPanel {
  title: string
  items: string[]
}

interface AvatarStore {
  values: AvatarState | null
  setValues: (payload: AvatarState) => void
  clearValues: () => void

  isAudioPlaying: boolean
  isAnimationPlaying: boolean
  isIdle: boolean
  setAudioPlaying: (playing: boolean) => void
  setAnimationPlaying: (playing: boolean) => void

  // Web search citations from the latest reply. Kept separate from `values` so
  // they persist while the avatar goes idle, instead of being cleared.
  sources: string[]
  setSources: (sources: string[]) => void

  // Optional on-screen list for long/list-like replies (the avatar only speaks
  // a summary). Persists until the next reply or the user closes it.
  panel: AnswerPanel | null
  setPanel: (panel: AnswerPanel | null) => void
}

export const useAvatarStore = create<AvatarStore>((set, get) => ({
  values: null,
  setValues: (payload) => set({ values: payload }),
  clearValues: () => set({ values: null }),

  isAudioPlaying: false,
  isAnimationPlaying: false,
  isIdle: true,

  setAudioPlaying: (playing) => {
    set({ isAudioPlaying: playing })
    const { isAnimationPlaying, clearValues } = get()
    const idle = !playing && !isAnimationPlaying
    set({ isIdle: idle })
    if (idle) clearValues()
  },

  setAnimationPlaying: (playing) => {
    set({ isAnimationPlaying: playing })
    const { isAudioPlaying, clearValues } = get()
    const idle = !playing && !isAudioPlaying
    set({ isIdle: idle })
    if (idle) clearValues()
  },

  sources: [],
  setSources: (sources) => set({ sources }),

  panel: null,
  setPanel: (panel) => set({ panel }),
}))
