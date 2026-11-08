import { apiDelete, apiGet } from './client'
import type { DataResponse } from './types'

/** Everything stored about the caller, as plain JSON. */
export async function exportMyData(signal?: AbortSignal): Promise<Record<string, unknown>> {
  return (await apiGet<DataResponse<Record<string, unknown>>>('/api/v1/account/export', { signal }))
    .data
}

/** Delete the caller's account for good. The password is asked for again. */
export async function deleteMyAccount(password: string): Promise<void> {
  await apiDelete<null>('/api/v1/account', { body: { password } })
}
