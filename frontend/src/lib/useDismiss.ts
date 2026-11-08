import { useEffect, type RefObject } from 'react'

/** While `open`: Escape or a mouse press outside `containerRef` calls `onDismiss`. */
export function useDismiss(
  open: boolean,
  onDismiss: () => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    const onMouseDown = (event: MouseEvent) => {
      const container = containerRef.current
      if (container && !container.contains(event.target as Node)) onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [open, onDismiss, containerRef])
}
