import { apiGet, apiPost } from './client'
import type {
  ApplicantItem,
  ApplicationDetail,
  ApplicationItem,
  ApplicationStatus,
  ApplyInput,
  DataResponse,
  PagedResponse,
} from './types'

export const APPLICATION_PAGE_SIZE = 20

/** Apply to a vacancy with the current profile and CV. */
export async function applyToVacancy(
  vacancyId: string,
  input: ApplyInput,
): Promise<ApplicationDetail> {
  return (
    await apiPost<DataResponse<ApplicationDetail>>(
      `/api/v1/vacancies/${vacancyId}/applications`,
      input,
    )
  ).data
}

export async function listMyApplications(
  page: number,
  signal?: AbortSignal,
): Promise<PagedResponse<ApplicationItem>> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(APPLICATION_PAGE_SIZE),
  })
  return apiGet<PagedResponse<ApplicationItem>>(`/api/v1/applications/me?${query}`, { signal })
}

/** The caller's application for one vacancy, or null if they have not applied. */
export async function fetchMyApplicationFor(
  vacancyId: string,
  signal?: AbortSignal,
): Promise<ApplicationItem | null> {
  const query = new URLSearchParams({ vacancy_id: vacancyId, page_size: '1' })
  const result = await apiGet<PagedResponse<ApplicationItem>>(`/api/v1/applications/me?${query}`, {
    signal,
  })
  return result.data[0] ?? null
}

export async function fetchApplication(
  id: string,
  signal?: AbortSignal,
): Promise<ApplicationDetail> {
  return (await apiGet<DataResponse<ApplicationDetail>>(`/api/v1/applications/${id}`, { signal }))
    .data
}

export async function withdrawApplication(id: string): Promise<ApplicationDetail> {
  return (await apiPost<DataResponse<ApplicationDetail>>(`/api/v1/applications/${id}/withdraw`))
    .data
}

export const APPLICANT_PAGE_SIZE = 20

/** Applicants for one of the employer's own vacancies, newest first. */
export async function listApplicants(
  vacancyId: string,
  status: ApplicationStatus | null,
  page: number,
  signal?: AbortSignal,
): Promise<PagedResponse<ApplicantItem>> {
  const query = new URLSearchParams({ page: String(page), page_size: String(APPLICANT_PAGE_SIZE) })
  if (status) query.set('status', status)
  return apiGet<PagedResponse<ApplicantItem>>(
    `/api/v1/employer/vacancies/${vacancyId}/applications?${query}`,
    { signal },
  )
}

/** Move an application to a new status. The note is shown to the applicant. */
export async function changeApplicationStatus(
  id: string,
  status: ApplicationStatus,
  note: string | null,
): Promise<ApplicationDetail> {
  return (
    await apiPost<DataResponse<ApplicationDetail>>(`/api/v1/employer/applications/${id}/status`, {
      status,
      note,
    })
  ).data
}

/** A plain link target: the browser sends the session cookie and saves the applicant's CV. */
export const applicationCvUrl = (id: string) => `/api/v1/employer/applications/${id}/cv`
