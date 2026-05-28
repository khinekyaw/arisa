import { List, X } from "lucide-react"

import { useAvatarStore } from "../store/avatarStore"

const DetailPanel = () => {
  const panel = useAvatarStore((s) => s.panel)
  const setPanel = useAvatarStore((s) => s.setPanel)

  if (!panel) return null

  return (
    <div className="flex max-h-[55vh] min-h-0 flex-col rounded-2xl border-2 border-white/10 bg-white/10 px-4 py-3 text-white backdrop-blur-2xl transition animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 opacity-70">
          <List size={14} className="shrink-0" />
          <span className="truncate text-xs uppercase tracking-wide">
            {panel.title || "Details"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setPanel(null)}
          aria-label="Close"
          className="shrink-0 opacity-70 transition hover:opacity-100"
        >
          <X size={14} />
        </button>
      </div>
      <ol className="flex min-h-0 list-decimal flex-col gap-2 overflow-y-auto pl-5 scrollbar-hide marker:text-white/40">
        {panel.items.map((item, i) => (
          <li key={i} className="leading-snug">
            {item}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default DetailPanel
