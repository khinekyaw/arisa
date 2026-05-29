import DOMPurify from "dompurify"
import { ChevronDown, ChevronUp, List, X } from "lucide-react"
import { useMemo, useState } from "react"

import { useAvatarStore } from "../store/avatarStore"

// The panel is model-authored HTML, so it must be sanitized before rendering.
// Allow only simple structural/text tags and links — no styles, scripts, or
// attributes beyond href.
const ALLOWED_TAGS = [
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "h3",
  "h4",
  "code",
  "span",
]

// Force any links to open safely in a new tab.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank")
    node.setAttribute("rel", "noreferrer noopener")
  }
})

const DetailPanel = () => {
  const panel = useAvatarStore((s) => s.panel)
  const setPanel = useAvatarStore((s) => s.setPanel)
  const [collapsed, setCollapsed] = useState(false)
  const [prevPanel, setPrevPanel] = useState(panel)

  // Re-expand when a new reply brings a fresh panel.
  if (panel !== prevPanel) {
    setPrevPanel(panel)
    setCollapsed(false)
  }

  const clean = useMemo(
    () =>
      DOMPurify.sanitize(panel ?? "", {
        ALLOWED_TAGS,
        ALLOWED_ATTR: ["href"],
      }),
    [panel],
  )

  if (!panel) return null

  return (
    <div className="flex max-h-[40vh] sm:max-h-[70vh] min-h-0 flex-col rounded-2xl border-2 border-white/10 bg-white/10 px-4 py-3 text-white backdrop-blur-2xl transition animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand details" : "Collapse details"}
          className="flex items-center justify-between flex-1"
        >
          <div className="flex min-w-0 items-center gap-2 opacity-70">
            <List size={14} className="shrink-0" />
            <span className="truncate text-xs uppercase tracking-wide">
              Details
            </span>
          </div>
          <span className="transition hover:opacity-100">
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2 opacity-70">
          <button
            type="button"
            onClick={() => setPanel(null)}
            aria-label="Close"
            className="transition hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div
          className="min-h-0 mt-2 overflow-y-auto scrollbar-hide text-sm leading-snug marker:text-white/40 [&_a]:wrap-break-word [&_a]:underline [&_a]:opacity-80 hover:[&_a]:opacity-100 [&_code]:font-mono [&_code]:text-xs [&_h4]:mb-1 [&_h4]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      )}
    </div>
  )
}

export default DetailPanel
