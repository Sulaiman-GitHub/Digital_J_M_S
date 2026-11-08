import { apiGet } from './client'
import type {
  DataResponse,
  EmploymentType,
  PagedResponse,
  VacancyCard,
  VacancyDetail,
  WorkArrangement,
} from './types'

const VACANCIES = '/api/v1/vacancies'

export const PAGE_SIZE = 20

export type VacancySort = 'relevance' | 'newest'

/** What the public list can be filtered by. Every field is optional. */
export interface VacancyFilters {
  q?: string
  district_id?: string
  qualification_level_id?: string
  employment_type?: EmploymentType
  work_arrangement?: WorkArrangement
  sort?: VacancySort
}

export function vacancyQuery(
  filters: VacancyFilters,
  page: number,
  pageSize: number = PAGE_SIZE,
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value)
  }
  query.set('page', String(page))
  query.set('page_size', String(pageSize))
  return query.toString()
}

export async function searchVacancies(
  filters: VacancyFilters,
  page: number,
  pageSize: number = PAGE_SIZE,
  signal?: AbortSignal,
): Promise<PagedResponse<VacancyCard>> {
  return apiGet<PagedResponse<VacancyCard>>(
    `${VACANCIES}?${vacancyQuery(filters, page, pageSize)}`,
    { signal },
  )
}

export async function fetchVacancy(id: string, signal?: AbortSignal): Promise<VacancyDetail> {
  return (await apiGet<DataResponse<VacancyDetail>>(`${VACANCIES}/${id}`, { signal })).data
}
