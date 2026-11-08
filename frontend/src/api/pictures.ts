import { apiDelete, apiGet, apiUpload, type UploadOptions } from './client'
import { ApiError, type DataResponse, type Picture } from './types'

export type PictureKind = 'photo' | 'logo'

const BASE: Record<PictureKind, string> = {
  photo: '/api/v1/photo/me',
  logo: '/api/v1/logo/me',
}

/** The picture itself, for an <img>. Add the version so a new upload shows straight away. */
export function pictureUrl(kind: PictureKind, version?: string): string {
  const url = `${BASE[kind]}/image`
  return version ? `${url}?v=${encodeURIComponent(version)}` : url
}

/** The photo an employer sees for someone who applied to their vacancy. */
export const applicantPhotoUrl = (applicationId: string) =>
  `/api/v1/employer/applications/${applicationId}/photo`

/** Details of the caller's picture, or null if there is none (404). */
export async function fetchPicture(kind: PictureKind, signal?: AbortSignal): Promise<Picture | null> {
  try {
    return (await apiGet<DataResponse<Picture>>(BASE[kind], { signal })).data
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function uploadPicture(
  kind: PictureKind,
  file: File,
  options?: UploadOptions,
): Promise<Picture> {
  const form = new FormData()
  form.append('file', file)
  return (await apiUpload<DataResponse<Picture>>(BASE[kind], form, options)).data
}

export async function deletePicture(kind: PictureKind): Promise<void> {
  await apiDelete<null>(BASE[kind])
}
