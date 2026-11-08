import { Link, useLocation } from 'react-router-dom'
import type { VacancyCard as VacancyCardData } from '../../api/types'
import { Badge } from '../../components/Badge'
import { Card } from '../../components/Card'
import { CompanyAvatar } from '../../components/CompanyAvatar'
import { cn } from '../../lib/cn'
import { BookmarkButton } from '../saved/BookmarkButton'
import { closingSoonLabel, postedLabel } from '../../lib/relativeDates'
import { EMPLOYMENT_LABELS, formatSalary, placeLabel } from './format'

/**
 * One vacancy in a list (mockup S3). The whole card is the link to the details. On wide screens
 * the job list passes `onSelect`: a plain click then shows the job in the side pane instead of
 * leaving the list (a new-tab or modified click still follows the link).
 */
export function VacancyCard({
  vacancy,
  now,
  selected = false,
  onSelect,
}: {
  vacancy: VacancyCardData
  now?: Date
  selected?: boolean
  onSelect?: () => void
}) {
  const location = useLocation()
  const salary = formatSalary(vacancy.salary_min, vacancy.salary_max)
  const closing = closingSoonLabel(vacancy.expires_at, now)

  return (
    <div className="relative">
      <Link
        to={`/jobs/${vacancy.id}`}
        // So "Back to results" on the details page returns to the same filters and page.
        state={{ from: location.search }}
        aria-current={selected ? 'true' : undefined}
        onClick={(event) => {
          if (!onSelect || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
            return
          }
          event.preventDefault()
          onSelect()
        }}
        className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Card
          className={cn(
            'flex gap-3 transition hover:border-primary hover:shadow-md',
            selected && 'border-2 border-primary shadow-md',
          )}
        >
          <CompanyAvatar name={vacancy.company_name} imageUrl={vacancy.company_logo_url} />
          <div className="min-w-0 flex-1 space-y-2 pr-8 break-words">
            <h3 className="text-lg font-semibold">{vacancy.title}</h3>
            <p className="text-text-secondary">{vacancy.company_name}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-text-secondary">
              <span>{placeLabel(vacancy.district_name, vacancy.work_arrangement)}</span>
              <Badge tone="primary">{EMPLOYMENT_LABELS[vacancy.employment_type]}</Badge>
            </div>
            {salary && <p className="font-semibold">{salary}</p>}
            <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-text-secondary">{postedLabel(vacancy.published_at, now)}</span>
              {closing && <span className="font-semibold text-warning">{closing}</span>}
            </p>
          </div>
        </Card>
      </Link>
      <BookmarkButton
        vacancyId={vacancy.id}
        title={vacancy.title}
        className="absolute top-2 right-2"
      />
    </div>
  )
}
