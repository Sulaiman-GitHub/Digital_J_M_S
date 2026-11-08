import { useQueries, useQuery } from '@tanstack/react-query'
import { fetchDistricts, fetchQualificationLevels } from '../../api/reference'
import { fetchVacancy, searchVacancies, type VacancyFilters } from '../../api/vacancies'

const REFERENCE_STALE_MS = 60 * 60 * 1000

export function useVacancySearch(filters: VacancyFilters, page: number) {
  return useQuery({
    queryKey: ['vacancies', 'search', filters, page],
    queryFn: ({ signal }) => searchVacancies(filters, page, undefined, signal),
    placeholderData: (previous) => previous, // keep the old page on screen while the next loads
  })
}

/** Just the number of matches (one tiny request), for "Show N jobs" in the phone filter sheet. */
export function useVacancyCount(filters: VacancyFilters, enabled: boolean) {
  return useQuery({
    queryKey: ['vacancies', 'count', filters],
    queryFn: ({ signal }) => searchVacancies(filters, 1, 1, signal),
    select: (result) => result.meta.total,
    enabled,
    placeholderData: (previous) => previous,
  })
}

export function useLatestVacancies(count: number) {
  return useQuery({
    queryKey: ['vacancies', 'latest', count],
    queryFn: ({ signal }) => searchVacancies({ sort: 'newest' }, 1, count, signal),
  })
}

export function useVacancy(id: string) {
  return useQuery({
    queryKey: ['vacancies', 'detail', id],
    queryFn: ({ signal }) => fetchVacancy(id, signal),
    retry: false, // a 404 (closed or expired) should show at once
  })
}

/** The two lists the filters need. Failing to load them does not stop the job list. */
export function useFilterLists() {
  const [districts, levels] = useQueries({
    queries: [
      {
        queryKey: ['reference', 'districts'],
        queryFn: ({ signal }: { signal: AbortSignal }) => fetchDistricts(signal),
        staleTime: REFERENCE_STALE_MS,
      },
      {
        queryKey: ['reference', 'qualification-levels'],
        queryFn: ({ signal }: { signal: AbortSignal }) => fetchQualificationLevels(signal),
        staleTime: REFERENCE_STALE_MS,
      },
    ],
  })
  return { districts: districts.data ?? [], levels: levels.data ?? [] }
}
