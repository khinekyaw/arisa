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

  // True while a reply is loading (request sent, avatar not yet speaking). Drives
  // the looping "think" animation; useVRMAnimations watches it.
  isThinking: boolean
  setThinking: (thinking: boolean) => void

  // Arisa's spoken-voice output controls. The TTS audio is created in
  // useVRMLipSync (inside the Canvas), so the level lives here to be shared
  // with the control UI rendered outside the Canvas.
  voiceVolume: number
  voiceMuted: boolean
  setVoiceVolume: (volume: number) => void
  setVoiceMuted: (muted: boolean) => void

  // Bumped to cut Arisa off mid-utterance (barge-in). useVRMLipSync watches
  // this and stops the playing audio.
  voiceInterruptNonce: number
  interruptVoice: () => void

  // Optional on-screen panel (limited HTML) for long/list-like replies or
  // sources — the avatar only speaks a summary. Persists across idle until the
  // next reply or the user closes it; kept out of `values` so it isn't cleared.
  panel: string | null
  setPanel: (panel: string | null) => void
}

export const useAvatarStore = create<AvatarStore>((set, get) => ({
  values: null,
  setValues: (payload) => set({ values: payload }),
  clearValues: () => set({ values: null }),

  isAudioPlaying: false,
  isAnimationPlaying: false,
  isIdle: true,
  isThinking: false,
  setThinking: (thinking) => set({ isThinking: thinking }),

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

  voiceVolume: 1,
  voiceMuted: false,
  setVoiceVolume: (volume) => set({ voiceVolume: volume }),
  setVoiceMuted: (muted) => set({ voiceMuted: muted }),

  voiceInterruptNonce: 0,
  interruptVoice: () =>
    set((s) => ({ voiceInterruptNonce: s.voiceInterruptNonce + 1 })),

  panel: null,
  setPanel: (panel) => set({ panel }),
}))
