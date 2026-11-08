import { apiGet, apiPost, apiPut } from './client'
import type {
  DataResponse,
  ManagedVacancy,
  PagedResponse,
  VacancyInput,
  VacancyStatus,
} from './types'

const EMPLOYER_VACANCIES = '/api/v1/employer/vacancies'
const ADMIN_VACANCIES = '/api/v1/admin/vacancies'

export const MANAGE_PAGE_SIZE = 20

export async function listMyVacancies(
  status: VacancyStatus | null,
  page: number,
  signal?: AbortSignal,
): Promise<PagedResponse<ManagedVacancy>> {
  const query = new URLSearchParams({ page: String(page), page_size: String(MANAGE_PAGE_SIZE) })
  if (status) query.set('status', status)
  return apiGet<PagedResponse<ManagedVacancy>>(`${EMPLOYER_VACANCIES}?${query}`, { signal })
}

export async function fetchMyVacancy(id: string, signal?: AbortSignal): Promise<ManagedVacancy> {
  return (await apiGet<DataResponse<ManagedVacancy>>(`${EMPLOYER_VACANCIES}/${id}`, { signal }))
    .data
}

export async function createVacancy(input: VacancyInput): Promise<ManagedVacancy> {
  return (await apiPost<DataResponse<ManagedVacancy>>(EMPLOYER_VACANCIES, input)).data
}

export async function updateVacancy(id: string, input: VacancyInput): Promise<ManagedVacancy> {
  return (await apiPut<DataResponse<ManagedVacancy>>(`${EMPLOYER_VACANCIES}/${id}`, input)).data
}

export async function publishVacancy(id: string): Promise<ManagedVacancy> {
  return (await apiPost<DataResponse<ManagedVacancy>>(`${EMPLOYER_VACANCIES}/${id}/publish`)).data
}

export async function closeVacancy(id: string): Promise<ManagedVacancy> {
  return (await apiPost<DataResponse<ManagedVacancy>>(`${EMPLOYER_VACANCIES}/${id}/close`)).data
}

/** An admin creates a vacancy for an approved partner employer (a draft, or published at once). */
export async function createVacancyForPartner(
  input: VacancyInput,
  employerId: string,
  publish: boolean,
): Promise<ManagedVacancy> {
  return (
    await apiPost<DataResponse<ManagedVacancy>>(ADMIN_VACANCIES, {
      ...input,
      employer_id: employerId,
      publish,
    })
  ).data
}
