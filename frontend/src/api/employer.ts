import { apiGet, apiPost, apiPut } from './client'
import { ApiError, type DataResponse, type Employer, type EmployerInput } from './types'

const EMPLOYER = '/api/v1/employer/me'

/** The caller's company, or null if they have not created it yet (404 employer_not_found). */
export async function fetchEmployer(signal?: AbortSignal): Promise<Employer | null> {
  try {
    return (await apiGet<DataResponse<Employer>>(EMPLOYER, { signal })).data
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Create the company profile (a draft) or edit it. */
export async function saveEmployer(input: EmployerInput): Promise<Employer> {
  return (await apiPut<DataResponse<Employer>>(EMPLOYER, input)).data
}

/** Send a complete profile for verification. */
export async function submitEmployer(): Promise<Employer> {
  return (await apiPost<DataResponse<Employer>>(`${EMPLOYER}/submit`)).data
}
