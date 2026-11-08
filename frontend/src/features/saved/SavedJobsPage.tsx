import { Link, useSearchParams } from 'react-router-dom'
import { SAVED_PAGE_SIZE } from '../../api/saved'
import { buttonClasses } from '../../components/buttonStyles'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Pagination } from '../../components/Pagination'
import { CardSkeletons } from '../vacancies/CardSkeletons'
import { VacancyCard } from '../vacancies/VacancyCard'
import { useSavedJobs } from './useSaved'

/** The job seeker's saved jobs: the open ones, most recently saved first. */
export function SavedJobsPage() {
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('page'))
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1
  const saved = useSavedJobs(page)

  const total = saved.data?.meta.total
  const pageCount = total === undefined ? 0 : Math.ceil(total / SAVED_PAGE_SIZE)

  return (
    <section aria-labelledby="saved-title" className="space-y-4">
      <div>
        <h1 id="saved-title" className="text-title-md font-semibold">
          Saved jobs
        </h1>
        {total !== undefined && total > 0 && (
          <p aria-live="polite" className="text-text-secondary">
            {`${total} ${total === 1 ? 'job' : 'jobs'} saved`}
          </p>
        )}
      </div>

      {saved.isPending ? (
        <CardSkeletons />
      ) : saved.isError ? (
        <ErrorState
          title="Could not load your saved jobs"
          message="We could not reach the server. Check your connection and try again."
          retrying={saved.isFetching}
          onRetry={() => void saved.refetch()}
        />
      ) : saved.data.data.length === 0 ? (
        <EmptyState
          title="No saved jobs yet"
          description="Tap the bookmark on a job to keep it here. Jobs that close or expire drop off this list."
          action={
            <Link to="/jobs" className={buttonClasses()}>
              Find jobs
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {saved.data.data.map((vacancy) => (
              <li key={vacancy.id}>
                <VacancyCard vacancy={vacancy} />
              </li>
            ))}
          </ul>
          <Pagination
            page={saved.data.meta.page}
            pageCount={pageCount}
            label="Saved job pages"
            onPageChange={(next) => {
              setParams(next > 1 ? { page: String(next) } : {})
              window.scrollTo?.({ top: 0 })
            }}
          />
        </>
      )}
    </section>
  )
}
