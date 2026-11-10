import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'
import { cn } from '../lib/cn'

/** Fades its children in the first time they scroll into view. Without IntersectionObserver
 * (old browsers, tests) they are simply shown. */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  className,
  children,
}: {
  as?: ElementType
  /** Milliseconds, to stagger neighbours. */
  delay?: number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const node = ref.current
    if (visible || !node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])

  return (
    <Tag
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn('reveal', visible && 'is-visible', className)}
    >
      {children}
    </Tag>
  )
}
