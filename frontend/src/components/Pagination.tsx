import { cn } from '../lib/cn'
import { pageItems } from './pageItems'

export interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  label?: string
  className?: string
}

const itemClasses =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-card px-2 font-medium ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export function Pagination({
  page,
  pageCount,
  onPageChange,
  label = 'Pagination',
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null

  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          <button
            type="button"
            className={cn(itemClasses, 'hover:bg-surface')}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <span aria-hidden="true">‹</span>
            <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
            <span className="sr-only"> page</span>
          </button>
        </li>
        {pageItems(page, pageCount).map((item) =>
          typeof item === 'number' ? (
            <li key={item}>
              <button
                type="button"
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Page ${item}`}
                onClick={() => item !== page && onPageChange(item)}
                className={cn(
                  itemClasses,
                  item === page ? 'bg-primary text-white' : 'text-text hover:bg-surface',
                )}
              >
                {item}
              </button>
            </li>
          ) : (
            <li key={item} aria-hidden="true" className="px-1 text-text-secondary">
              …
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            className={cn(itemClasses, 'hover:bg-surface')}
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
            <span className="sr-only"> page</span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
