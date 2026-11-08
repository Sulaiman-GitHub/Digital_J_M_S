import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PAGE_SIZE, type VacancyFilters } from '../../api/vacancies'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Pagination } from '../../components/Pagination'
import { Pill } from '../../components/Pill'
import { SearchBar } from '../../components/SearchBar'
import { Select } from '../../components/Select'
import { cn } from '../../lib/cn'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { ARRANGEMENT_LABELS, EMPLOYMENT_LABELS } from './format'
import { CardSkeletons } from './CardSkeletons'
import { JobFilterChips } from './JobFilterChips'
import { JobFilters } from './JobFilters'
import { VacancyPane } from './JobDetailPage'
import {
  Q_MAX_LENGTH,
  filterCount,
  hasAnyFilter,
  parseJobsState,
  toJobsSearch,
} from './searchParams'
import { useFilterLists, useVacancyCount, useVacancySearch } from './useVacancies'
import { VacancyCard } from './VacancyCard'

/** The job list (mockup S2). Search words, filters and page all live in the address. */
export function JobsPage() {
  const [params, setParams] = useSearchParams()
  const { filters, page } = parseJobsState(params)
  const results = useVacancySearch(filters, page)
  const { districts, levels } = useFilterLists()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [picked, setPicked] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<VacancyFilters>(filters)
  const draftCount = useVacancyCount(draft, sheetOpen)
  const [searchText, setSearchText] = useState(filters.q ?? '')
  const [lastQ, setLastQ] = useState(filters.q ?? '')
  if ((filters.q ?? '') !== lastQ) {
    // The address changed (back button, a pill removed): the box shows what was searched.
    setLastQ(filters.q ?? '')
    setSearchText(filters.q ?? '')
  }

  const go = (next: VacancyFilters, nextPage = 1) => setParams(toJobsSearch(next, nextPage))
  const total = results.data?.meta.total
  const pageCount = total === undefined ? 0 : Math.ceil(total / PAGE_SIZE)
  // Wide screens show the chosen job beside the list; by default the first one on the page.
  const listed = results.data?.data ?? []
  const selectedId = wide ? (listed.find((item) => item.id === picked)?.id ?? listed[0]?.id) : undefined
  const districtName = districts.find((item) => item.id === filters.district_id)?.name
  const levelName = levels.find((item) => item.id === filters.qualification_level_id)?.name

  function openSheet() {
    setDraft(filters)
    setSheetOpen(true)
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const text = searchText.trim()
    go({ ...filters, q: text || undefined, sort: text ? filters.sort : undefined })
  }

  const count = filterCount(filters)
  const summary =
    total === undefined
      ? ''
      : `${total} ${total === 1 ? 'job' : 'jobs'}${filters.q ? ` for “${filters.q}”` : ''}${
          districtName ? ` in ${districtName}` : ''
        }`

  return (
    <section aria-labelledby="jobs-title" className="space-y-4">
      <h1 id="jobs-title" className="sr-only">
        Find a job
      </h1>

      <SearchBar
        whatLabel="Search jobs"
        whatValue={searchText}
        onWhatChange={setSearchText}
        whatMaxLength={Q_MAX_LENGTH}
        whereLabel="Where"
        whereValue={filters.district_id ?? ''}
        onWhereChange={(district_id) => go({ ...filters, district_id: district_id || undefined })}
        wherePlaceholder="All districts"
        districts={districts}
        submitLabel="Search"
        onSubmit={submitSearch}
      />

      <aside aria-label="Filters" className="hidden md:block">
        <JobFilterChips value={filters} onChange={(next) => go(next)} levels={levels} />
      </aside>

      <div className={cn(wide && 'grid grid-cols-[minmax(0,26rem)_1fr] items-start gap-6')}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="font-semibold">
              {summary || ' '}
            </p>
            <div className="flex items-center gap-2">
              {filters.q && (
                <Select
                  label="Sort"
                  className="w-40"
                  options={[
                    { value: 'relevance', label: 'Best match' },
                    { value: 'newest', label: 'Newest' },
                  ]}
                  value={filters.sort ?? 'relevance'}
                  onChange={(event) =>
                    go({
                      ...filters,
                      sort: event.target.value === 'newest' ? 'newest' : undefined,
                    })
                  }
                />
              )}
              <Button variant="secondary" className="md:hidden" onClick={openSheet}>
                {count > 0 ? `Filters (${count})` : 'Filters'}
              </Button>
            </div>
          </div>

          {hasAnyFilter(filters) && (
            <div
              className="flex flex-wrap items-center gap-2"
              aria-label="Active filters"
              role="group"
            >
              {filters.q && (
                <Pill
                  label={`“${filters.q}”`}
                  onRemove={() => go({ ...filters, q: undefined, sort: undefined })}
                />
              )}
              {filters.district_id && (
                <Pill
                  label={districtName ?? 'District'}
                  onRemove={() => go({ ...filters, district_id: undefined })}
                />
              )}
              {filters.employment_type && (
                <Pill
                  label={EMPLOYMENT_LABELS[filters.employment_type]}
                  onRemove={() => go({ ...filters, employment_type: undefined })}
                />
              )}
              {filters.work_arrangement && (
                <Pill
                  label={ARRANGEMENT_LABELS[filters.work_arrangement]}
                  onRemove={() => go({ ...filters, work_arrangement: undefined })}
                />
              )}
              {filters.qualification_level_id && (
                <Pill
                  label={levelName ?? 'Qualification'}
                  onRemove={() => go({ ...filters, qualification_level_id: undefined })}
                />
              )}
              <Button variant="ghost" onClick={() => go({})}>
                Clear all
              </Button>
            </div>
          )}

          {results.isPending ? (
            <CardSkeletons />
          ) : results.isError ? (
            <ErrorState
              title="Could not load jobs"
              message="We could not reach the server. Check your connection and try again."
              retrying={results.isFetching}
              onRetry={() => void results.refetch()}
            />
          ) : results.data.data.length === 0 ? (
            <EmptyState
              title="No jobs match your search"
              description={
                hasAnyFilter(filters)
                  ? 'Try fewer filters or different words.'
                  : 'There are no vacancies right now. Check back soon.'
              }
              action={
                hasAnyFilter(filters) ? (
                  <Button variant="secondary" onClick={() => go({})}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul className="space-y-3">
                {results.data.data.map((vacancy) => (
                  <li key={vacancy.id}>
                    <VacancyCard
                      vacancy={vacancy}
                      selected={vacancy.id === selectedId}
                      onSelect={wide ? () => setPicked(vacancy.id) : undefined}
                    />
                  </li>
                ))}
              </ul>
              <Pagination
                page={results.data.meta.page}
                pageCount={pageCount}
                label="Job pages"
                onPageChange={(next) => {
                  go(filters, next)
                  window.scrollTo?.({ top: 0 })
                }}
              />
            </>
          )}
        </div>

        {wide && selectedId && (
          <section
            aria-label="Selected job"
            className="sticky top-4 max-h-[calc(100svh-2rem)] overflow-y-auto rounded-card border border-border bg-white p-6 shadow-sm"
          >
            <VacancyPane id={selectedId} />
          </section>
        )}
      </div>

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft({ q: filters.q, sort: filters.sort })}>
              Clear
            </Button>
            <Button
              onClick={() => {
                go(draft)
                setSheetOpen(false)
              }}
            >
              {draftCount.data === undefined
                ? 'Show jobs'
                : `Show ${draftCount.data} ${draftCount.data === 1 ? 'job' : 'jobs'}`}
            </Button>
          </>
        }
      >
        {sheetOpen && (
          <JobFilters value={draft} onChange={setDraft} districts={districts} levels={levels} />
        )}
      </Modal>
    </section>
  )
}
