import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Reveal } from '../../components/Reveal'
import { SearchBar } from '../../components/SearchBar'
import { cn } from '../../lib/cn'
import { useAuth } from '../auth/authContext'
import { toJobsSearch } from '../vacancies/searchParams'
import { useFilterLists, useLatestVacancies } from '../vacancies/useVacancies'
import { CardSkeletons } from '../vacancies/CardSkeletons'
import { VacancyCard } from '../vacancies/VacancyCard'
import { Faq, Features, ForEmployers, HowItWorks } from './LandingSections'
import { Band, Container, Eyebrow } from './landingBits'
import { IMAGES, SUPPORT_EMAIL, SUPPORT_PHONE_HREF, SUPPORT_PHONE_LABEL } from './landingContent'
import { SupportSection } from './SupportSection'
import { VisionSection } from './VisionSection'

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

/**
 * The landing page (decision 026): a photo hero with search, the vision, the latest vacancies,
 * how it works, and, below the jobs, a clearly labelled support and sponsor section. The page
 * runs in full-width bands; AppLayout gives it no width limit.
 */
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
    <div>
      <section
        aria-labelledby="home-title"
        className="relative isolate overflow-hidden bg-hero-to text-white"
      >
        <img
          src={IMAGES.hero.src}
          srcSet={IMAGES.hero.srcSet}
          sizes="100vw"
          alt=""
          width={1400}
          height={933}
          fetchPriority="high"
          className="absolute inset-0 -z-20 size-full object-cover object-[center_30%]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-linear-to-r from-hero-to/95 via-hero-to/80 to-hero-from/50"
        />
        <Container className="space-y-6 py-8 md:py-14">
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <a href={SUPPORT_PHONE_HREF} className="underline">
              Call {SUPPORT_PHONE_LABEL}
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
          <div className="animate-rise max-w-2xl space-y-2">
            <h1 id="home-title" className="text-title-lg font-bold md:text-4xl">
              Find jobs and internships across Uganda
            </h1>
            <p className="text-lg text-white">
              For students and graduates of every university and tertiary institution.
            </p>
          </div>
          <SearchBar
            className="max-w-4xl"
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
          <nav aria-label="Popular searches" className="flex flex-wrap items-center gap-2">
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
          <ul className="grid grid-cols-2 gap-3 border-t border-white/30 pt-6 md:grid-cols-4">
            {[
              ...(total > 0
                ? [{ big: String(total), small: total === 1 ? 'open job' : 'open jobs' }]
                : []),
              { big: 'Free', small: 'for students and graduates' },
              { big: 'Verified', small: 'employers only' },
              { big: 'Every', small: 'tertiary institution' },
            ].map((stat) => (
              <li key={stat.small}>
                <p className="text-title-md font-bold">{stat.big}</p>
                <p className="text-sm text-white">{stat.small}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <VisionSection />

      <Band tone="tint">
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <section aria-labelledby="latest-title" className="min-w-0 space-y-6">
            <Reveal className="flex flex-wrap items-end justify-between gap-2">
              <div className="space-y-2">
                <Eyebrow>Open now</Eyebrow>
                <h2 id="latest-title" className="text-title-md font-bold md:text-title-lg">
                  Latest vacancies
                </h2>
              </div>
              <Link to="/jobs" className="text-primary underline">
                See all
              </Link>
            </Reveal>

            <div className="space-y-3">
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
                  <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:block lg:space-y-3">
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
            </div>
          </section>

          <aside aria-label="Quick links" className="space-y-4 self-start">
            <div className="space-y-2 rounded-card border border-border bg-card p-4">
              <h3 className="font-semibold">Quick links</h3>
              <ul className="space-y-1 text-primary">
                <li>
                  <Link to="/jobs" className="underline">
                    Browse all jobs
                  </Link>
                </li>
                <li>
                  <Link to="/jobs?employment_type=internship" className="underline">
                    Internships
                  </Link>
                </li>
                <li>
                  <Link to="/#how-it-works" className="underline">
                    How it works
                  </Link>
                </li>
                <li>
                  <Link to="/#faq" className="underline">
                    Questions and answers
                  </Link>
                </li>
              </ul>
            </div>
            <div className="space-y-2 rounded-card border border-border bg-card p-4">
              <h3 className="font-semibold">Hiring?</h3>
              <p className="text-text-secondary">
                Reach students and graduates from every institution.
              </p>
              <Link to="/#for-employers" className="inline-block text-primary underline">
                See how it works for employers
              </Link>
            </div>
          </aside>
        </div>
      </Band>

      <Band>
        <HowItWorks role={user?.role} />
      </Band>
      <Band tone="tint">
        <Features />
      </Band>
      <Band>
        <ForEmployers role={user?.role} />
      </Band>
      <SupportSection />
      <Band tone="tint">
        <Faq />
      </Band>
    </div>
  )
}
