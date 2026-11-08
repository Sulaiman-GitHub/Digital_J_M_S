import { apiGet, apiPost } from './client'
import type {
  AdminEmployerDetail,
  AdminEmployerItem,
  DataResponse,
  PagedResponse,
  VerificationStatus,
} from './types'

const ADMIN = '/api/v1/admin/employers'

export const QUEUE_PAGE_SIZE = 20

export async function listEmployers(
  status: VerificationStatus | null,
  page: number,
  signal?: AbortSignal,
): Promise<PagedResponse<AdminEmployerItem>> {
  const query = new URLSearchParams({ page: String(page), page_size: String(QUEUE_PAGE_SIZE) })
  if (status) query.set('status', status)
  return apiGet<PagedResponse<AdminEmployerItem>>(`${ADMIN}?${query}`, { signal })
}

export async function fetchEmployerDetail(
  id: string,
  signal?: AbortSignal,
): Promise<AdminEmployerDetail> {
  return (await apiGet<DataResponse<AdminEmployerDetail>>(`${ADMIN}/${id}`, { signal })).data
}

export async function approveEmployer(id: string): Promise<AdminEmployerDetail> {
  return (await apiPost<DataResponse<AdminEmployerDetail>>(`${ADMIN}/${id}/approve`)).data
}

export async function rejectEmployer(id: string, reason: string): Promise<AdminEmployerDetail> {
  return (await apiPost<DataResponse<AdminEmployerDetail>>(`${ADMIN}/${id}/reject`, { reason }))
    .data
}

export async function suspendEmployer(id: string, reason: string): Promise<AdminEmployerDetail> {
  return (await apiPost<DataResponse<AdminEmployerDetail>>(`${ADMIN}/${id}/suspend`, { reason }))
    .data
}

/** The approved employers an admin can create vacancies for (the first 50). */
export async function listPartnerEmployers(signal?: AbortSignal) {
  const query = new URLSearchParams({ status: 'approved', page: '1', page_size: '50' })
  return apiGet<PagedResponse<AdminEmployerItem>>(`${ADMIN}?${query}`, { signal })
}
