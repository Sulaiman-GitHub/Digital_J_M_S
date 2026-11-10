import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { SearchBar } from '../../components/SearchBar'
import { cn } from '../../lib/cn'
import { useAuth } from '../auth/authContext'
import { toJobsSearch } from '../vacancies/searchParams'
import { useFilterLists, useLatestVacancies } from '../vacancies/useVacancies'
import { CardSkeletons } from '../vacancies/CardSkeletons'
import { VacancyCard } from '../vacancies/VacancyCard'
import { Faq, Features, ForEmployers, HowItWorks } from './LandingSections'

// Popular searches are plain links to pre-filtered results (mockup S1), not toggles.
const POPULAR = [
  { label: 'Internships', search: toJobsSearch({ employment_type: 'internship' }) },
  { label: 'Graduate trainee', search: toJobsSearch({ q: 'graduate trainee' }) },
  { label: 'Part-time', search: toJobsSearch({ employment_type: 'part_time' }) },
  { label: 'IT & software', search: toJobsSearch({ q: 'software' }) },
  { label: 'Accounting', search: toJobsSearch({ q: 'accounts' }) },
] as const

const LATEST_COUNT = 6
const PHONE_COUNT = 3

/** The front door (mockup S1): search, popular searches and the latest vacancies. */
export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { districts } = useFilterLists()
  const latest = useLatestVacancies(LATEST_COUNT)
  const [q, setQ] = useState('')
  const [district, setDistrict] = useState('')

  function search(event: FormEvent) {
    event.preventDefault()
    navigate(
      `/jobs${toJobsSearch({ q: q.trim() || undefined, district_id: district || undefined })}`,
    )
  }

  const total = latest.data?.meta.total ?? 0

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="home-title"
        className="relative -mx-4 -mt-6 space-y-4 overflow-hidden bg-linear-to-br from-hero-from to-hero-to px-4 py-10 text-white shadow-md md:mx-0 md:mt-0 md:rounded-card md:px-10 md:py-12"
      >
        <span
          aria-hidden="true"
          className="animate-float pointer-events-none absolute -top-16 -right-10 size-56 rounded-pill bg-white/10"
        />
        <span
          aria-hidden="true"
          className="animate-float pointer-events-none absolute -bottom-20 left-1/3 size-48 rounded-pill bg-white/5 [animation-delay:-3s]"
        />
        <div className="animate-rise relative">
          <h1 id="home-title" className="text-title-md font-bold sm:text-title-lg">
            Find jobs and internships across Uganda
          </h1>
          <p className="mt-1 text-white">
            For students and graduates of every university and tertiary institution.
          </p>
        </div>
        <SearchBar
          className="relative"
          whatLabel="What"
          whatValue={q}
          onWhatChange={setQ}
          whereLabel="Where"
          whereValue={district}
          onWhereChange={setDistrict}
          wherePlaceholder="All districts"
          districts={districts}
          submitLabel="Search jobs"
          onSubmit={search}
        />
        <nav aria-label="Popular searches" className="relative flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">Popular</span>
          {POPULAR.map((item) => (
            <Link
              key={item.label}
              to={`/jobs${item.search}`}
              className="inline-flex min-h-9 items-center rounded-pill border border-white bg-white/10 px-3.5 text-sm font-medium text-white hover:bg-white hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <ul className="relative flex flex-wrap gap-x-5 gap-y-1 pt-1 text-sm text-white">
          {[
            'Free for students and graduates',
            'Verified employers',
            'Every tertiary institution',
          ].map((point) => (
            <li key={point} className="flex items-center gap-1.5">
              <span aria-hidden="true">✓</span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="latest-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="latest-title" className="text-title-sm font-semibold">
            Latest vacancies
          </h2>
          <Link to="/jobs" className="text-primary underline">
            See all
          </Link>
        </div>

        {latest.isPending ? (
          <CardSkeletons />
        ) : latest.isError ? (
          <ErrorState
            title="Could not load vacancies"
            message="We could not reach the server. Check your connection and try again. You can still search."
            retrying={latest.isFetching}
            onRetry={() => void latest.refetch()}
          />
        ) : latest.data.data.length === 0 ? (
          <EmptyState title="No vacancies yet" description="Check back soon." />
        ) : (
          <>
            <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
              {latest.data.data.map((vacancy, index) => (
                <li key={vacancy.id} className={cn(index >= PHONE_COUNT && 'max-md:hidden')}>
                  <VacancyCard vacancy={vacancy} />
                </li>
              ))}
            </ul>
            <Link to="/jobs" className="inline-block text-primary underline">
              {`See all ${total} ${total === 1 ? 'job' : 'jobs'}`}
            </Link>
          </>
        )}
      </section>

      <HowItWorks />
      <Features />
      <ForEmployers role={user?.role} />
      <Faq />
    </div>
  )
}
