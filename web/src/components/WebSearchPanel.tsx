import { Globe, X } from "lucide-react"

import { useAvatarStore } from "../store/avatarStore"

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const WebSearchPanel = () => {
  const sources = useAvatarStore((s) => s.sources)
  const setSources = useAvatarStore((s) => s.setSources)

  if (!sources.length) return null

  return (
    <div className="flex max-h-[35vh] min-h-0 flex-col rounded-2xl border-2 border-white/10 bg-white/10 px-3 py-3 text-white backdrop-blur-2xl transition animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="mb-2 flex shrink-0 items-center justify-between opacity-70">
        <div className="flex items-center gap-2">
          <Globe size={14} />
          <span className="text-xs uppercase tracking-wide">Sources</span>
        </div>
        <button
          type="button"
          onClick={() => setSources([])}
          aria-label="Close sources"
          className="transition hover:opacity-100"
        >
          <X size={14} />
        </button>
      </div>
      <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto scrollbar-hide">
        {sources.map((url, i) => (
          <li key={`${url}-${i}`}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title={url}
              className="block truncate rounded-lg px-2 py-1 opacity-80 transition hover:bg-white/10 hover:opacity-100"
            >
              {hostname(url)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default WebSearchPanel
