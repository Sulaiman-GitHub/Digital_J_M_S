import { ApiError } from '../../api/types'

// These mirror the server (services/image_files.py, MAX_IMAGE_BYTES). The server stays the
// authority: it checks what is inside the file. Checking here just saves a slow upload.
export const PICTURE_MAX_BYTES = 2 * 1024 * 1024
export const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PICTURE_ACCEPT = 'image/jpeg,image/png,image/webp'

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A message if the chosen file is not acceptable, or null if it looks fine. */
export function checkPictureFile(file: { type: string; size: number }): string | null {
  if (!(PICTURE_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a JPEG, PNG or WebP picture.'
  }
  if (file.size === 0) return 'This file is empty. Choose your picture again.'
  if (file.size > PICTURE_MAX_BYTES) {
    return `This picture is ${megabytes(file.size)}. The limit is ${megabytes(PICTURE_MAX_BYTES)}.`
  }
  return null
}

export function pictureErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return `This picture is too big. The limit is ${megabytes(PICTURE_MAX_BYTES)}. Try a smaller one.`
    }
    if (error.status === 429) return 'Too many uploads. Please wait a minute and try again.'
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
