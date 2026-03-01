export const playBase64Audio = (base64: string, mimeType = "audio/mpeg") => {
  const audio = new Audio(`data:${mimeType};base64,${base64}`)
  audio.play()
}
