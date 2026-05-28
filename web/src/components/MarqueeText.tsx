import { useEffect, useRef, useState, type CSSProperties } from "react"

const MARQUEE_SPEED = 60 // px per second
const GAP = 32 // px between the repeated copies

const MarqueeText = ({
  text,
  className,
}: {
  text: string
  className?: string
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)
  const [stride, setStride] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const content = contentRef.current
      if (!content) return
      const textWidth = content.offsetWidth
      setOverflow(textWidth > container.clientWidth)
      setStride(textWidth + GAP)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    return () => ro.disconnect()
  }, [text])

  const marqueeStyle: CSSProperties = {
    "--marquee-w": `${stride}px`,
    animationDuration: `${stride / MARQUEE_SPEED}s`,
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden whitespace-nowrap ${className ?? ""}`}
    >
      {overflow ? (
        <div className="flex w-max animate-marquee" style={marqueeStyle}>
          <span ref={contentRef} style={{ marginRight: GAP }}>
            {text}
          </span>
          <span aria-hidden style={{ marginRight: GAP }}>
            {text}
          </span>
        </div>
      ) : (
        <span ref={contentRef}>{text}</span>
      )}
    </div>
  )
}

export default MarqueeText
