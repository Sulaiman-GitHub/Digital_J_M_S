import { apiGet, apiPost } from './client'
import type {
  AdminReport,
  DataResponse,
  PagedResponse,
  ReportCreated,
  ReportInput,
  ReportStatus,
  ResolveInput,
} from './types'

export const REPORT_PAGE_SIZE = 20

/** Report a live vacancy (any logged-in user). */
export async function reportVacancy(vacancyId: string, input: ReportInput): Promise<ReportCreated> {
  return (
    await apiPost<DataResponse<ReportCreated>>(`/api/v1/vacancies/${vacancyId}/reports`, input)
  ).data
}

export async function listReports(
  status: ReportStatus | null,
  page: number,
  signal?: AbortSignal,
): Promise<PagedResponse<AdminReport>> {
  const query = new URLSearchParams({ page: String(page), page_size: String(REPORT_PAGE_SIZE) })
  if (status) query.set('status', status)
  return apiGet<PagedResponse<AdminReport>>(`/api/v1/admin/reports?${query}`, { signal })
}

export async function resolveReport(id: string, input: ResolveInput): Promise<AdminReport> {
  return (await apiPost<DataResponse<AdminReport>>(`/api/v1/admin/reports/${id}/resolve`, input))
    .data
}
