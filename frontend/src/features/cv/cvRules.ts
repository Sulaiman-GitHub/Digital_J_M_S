import { ApiError } from '../../api/types'

// These mirror the server (services/cv_files.py, MAX_CV_BYTES). The server stays the authority:
// it also checks what is inside the file. Checking here just saves a slow upload.
export const CV_MAX_BYTES = 5 * 1024 * 1024
export const CV_EXTENSIONS = ['pdf', 'doc', 'docx'] as const
export const CV_ACCEPT = '.pdf,.doc,.docx'

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A message to show if the chosen file is not acceptable, or null if it looks fine. */
export function checkCvFile(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf('.')
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  if (!(CV_EXTENSIONS as readonly string[]).includes(extension)) {
    return 'Choose a PDF or Word file (.pdf, .doc or .docx).'
  }
  if (file.size === 0) return 'This file is empty. Choose your CV file again.'
  if (file.size > CV_MAX_BYTES) {
    return `This file is ${formatFileSize(file.size)}. The limit is ${formatFileSize(CV_MAX_BYTES)}.`
  }
  return null
}

/** What to tell the user when an upload fails. */
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return `This file is too big. The limit is ${formatFileSize(CV_MAX_BYTES)}. Try a smaller file.`
    }
    if (error.status === 415) {
      return error.code === 'file_type_mismatch'
        ? `${error.message} Save it again as a PDF or Word file and try once more.`
        : error.message
    }
    if (error.status === 429) return 'Too many uploads. Please wait a minute and try again.'
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
