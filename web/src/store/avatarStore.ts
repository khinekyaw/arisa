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

interface AvatarStore {
  values: AvatarState | null
  setValues: (payload: AvatarState) => void
  clearValues: () => void

  isAudioPlaying: boolean
  isAnimationPlaying: boolean
  isIdle: boolean
  setAudioPlaying: (playing: boolean) => void
  setAnimationPlaying: (playing: boolean) => void
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
}))
