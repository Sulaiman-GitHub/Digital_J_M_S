import { apiDelete, apiGet, apiPut } from './client'
import type { DataResponse, PagedResponse, VacancyCard } from './types'

const BASE = '/api/v1/saved-vacancies'
export const SAVED_PAGE_SIZE = 20

/** The ids of the caller's saved open vacancies (to fill the bookmark on cards). */
export async function fetchSavedIds(signal?: AbortSignal): Promise<string[]> {
  return (await apiGet<DataResponse<{ vacancy_ids: string[] }>>(`${BASE}/ids`, { signal })).data
    .vacancy_ids
}

export async function listSaved(
  page: number,
  signal?: AbortSignal,
): Promise<PagedResponse<VacancyCard>> {
  const query = new URLSearchParams({ page: String(page), page_size: String(SAVED_PAGE_SIZE) })
  return apiGet<PagedResponse<VacancyCard>>(`${BASE}?${query}`, { signal })
}

export async function saveVacancy(vacancyId: string): Promise<void> {
  await apiPut<null>(`${BASE}/${vacancyId}`)
}

export async function unsaveVacancy(vacancyId: string): Promise<void> {
  await apiDelete<null>(`${BASE}/${vacancyId}`)
}
