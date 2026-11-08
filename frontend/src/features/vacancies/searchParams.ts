import type { EmploymentType, WorkArrangement } from '../../api/types'
import type { VacancyFilters, VacancySort } from '../../api/vacancies'
import { ARRANGEMENT_LABELS, EMPLOYMENT_LABELS } from './format'

// The address of the job list is its state: /jobs?q=accounts&district_id=...&page=2.
// Anything in the address that is not valid is ignored rather than breaking the page.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const Q_MAX_LENGTH = 200

const isEmployment = (value: string | null): value is EmploymentType =>
  value !== null && Object.hasOwn(EMPLOYMENT_LABELS, value)
const isArrangement = (value: string | null): value is WorkArrangement =>
  value !== null && Object.hasOwn(ARRANGEMENT_LABELS, value)
const isSort = (value: string | null): value is VacancySort =>
  value === 'relevance' || value === 'newest'

export interface JobsState {
  filters: VacancyFilters
  page: number
}

export function parseJobsState(params: URLSearchParams): JobsState {
  const filters: VacancyFilters = {}
  const q = params.get('q')?.trim().slice(0, Q_MAX_LENGTH)
  if (q) filters.q = q
  const district = params.get('district_id')
  if (district && UUID.test(district)) filters.district_id = district
  const level = params.get('qualification_level_id')
  if (level && UUID.test(level)) filters.qualification_level_id = level
  const type = params.get('employment_type')
  if (isEmployment(type)) filters.employment_type = type
  const arrangement = params.get('work_arrangement')
  if (isArrangement(arrangement)) filters.work_arrangement = arrangement
  const sort = params.get('sort')
  if (isSort(sort)) filters.sort = sort
  const page = Number(params.get('page'))
  return { filters, page: Number.isInteger(page) && page >= 1 ? page : 1 }
}

/** The address for some filters and a page. Page 1 is left out, as are empty filters. */
export function toJobsSearch(filters: VacancyFilters, page = 1): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** Number of filters set, not counting the search words or sorting (shown on the button). */
export function filterCount(filters: VacancyFilters): number {
  return [
    filters.district_id,
    filters.qualification_level_id,
    filters.employment_type,
    filters.work_arrangement,
  ].filter(Boolean).length
}

export function hasAnyFilter(filters: VacancyFilters): boolean {
  return filterCount(filters) > 0 || Boolean(filters.q)
}
