export type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

/** Page numbers to show: always first and last, the current page and its neighbours. */
export function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)

  const pages = new Set([1, pageCount, page - 1, page, page + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)

  const items: PageItem[] = []
  sorted.forEach((p, i) => {
    const previous = sorted[i - 1]
    if (previous !== undefined && p - previous > 1) {
      items.push(p < page ? 'ellipsis-start' : 'ellipsis-end')
    }
    items.push(p)
  })
  return items
}
