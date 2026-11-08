import { apiDelete, apiGet, apiUpload, type UploadOptions } from './client'
import { ApiError, type Cv, type DataResponse } from './types'

const CV = '/api/v1/cv/me'

/** A plain link target: the browser sends the session cookie and saves the file. */
export const CV_DOWNLOAD_URL = `${CV}/download`

/** The caller's CV details, or null if they have not uploaded one (404 cv_not_found). */
export async function fetchCv(signal?: AbortSignal): Promise<Cv | null> {
  try {
    return (await apiGet<DataResponse<Cv>>(CV, { signal })).data
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Upload a CV. It replaces the current one. */
export async function uploadCv(file: File, options?: UploadOptions): Promise<Cv> {
  const form = new FormData()
  form.append('file', file)
  return (await apiUpload<DataResponse<Cv>>(CV, form, options)).data
}

export async function deleteCv(): Promise<void> {
  await apiDelete<null>(CV)
}
