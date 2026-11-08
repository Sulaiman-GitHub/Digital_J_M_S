import { apiGet } from './client'
import type { DataResponse } from './types'

export interface Health {
  status: string
  database: string
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await apiGet<DataResponse<Health>>('/api/v1/health', { signal })
  return response.data
}
