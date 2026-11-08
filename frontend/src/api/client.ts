// The only place the app talks HTTP. Components never call fetch directly.
import { ApiError, type ErrorEnvelope } from './types'

export const CSRF_COOKIE = 'djm_csrf'
export const CSRF_HEADER = 'X-CSRF-Token'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  body?: unknown
  signal?: AbortSignal
}

export function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of document.cookie.split(';')) {
    const cookie = part.trim()
    if (cookie.startsWith(prefix)) return decodeURIComponent(cookie.slice(prefix.length))
  }
  return null
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const error = (value as { error: unknown }).error
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined

  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      body = options.body // the browser sets the multipart boundary
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }
  }

  if (UNSAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) headers[CSRF_HEADER] = csrf
  }

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(
      'network_error',
      'Could not reach the server. Check your connection and try again.',
      null,
      0,
    )
  }

  return interpret<T>(response.ok, response.status, await parseJson(response))
}

/** Turn a parsed response into its data, or throw the ApiError the server described. */
function interpret<T>(ok: boolean, status: number, payload: unknown): T {
  if (!ok) {
    if (isErrorEnvelope(payload)) {
      const { code, message, details } = payload.error
      throw new ApiError(code, message, details ?? null, status)
    }
    throw new ApiError(
      'unexpected_response',
      'Something went wrong. Please try again.',
      null,
      status,
    )
  }

  if (payload === undefined) {
    throw new ApiError(
      'unexpected_response',
      'The server sent a response we could not read.',
      null,
      status,
    )
  }

  return payload as T
}

export interface UploadOptions {
  /** Called with 0-100 as the file is sent. */
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

/**
 * POST a file with progress. fetch cannot report upload progress, so this uses XMLHttpRequest.
 * Same rules as apiRequest: cookies, CSRF header, and the server's error envelope as ApiError.
 */
export function apiUpload<T>(
  path: string,
  body: FormData,
  { onProgress, signal }: UploadOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', path)
    request.withCredentials = true
    request.setRequestHeader('Accept', 'application/json')
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) request.setRequestHeader(CSRF_HEADER, csrf)

    const abort = () => request.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const finish = () => signal?.removeEventListener('abort', abort)

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    }
    request.onload = () => {
      finish()
      let payload: unknown
      try {
        payload = request.responseText ? JSON.parse(request.responseText) : null
      } catch {
        payload = undefined
      }
      try {
        resolve(
          interpret<T>(request.status >= 200 && request.status < 300, request.status, payload),
        )
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () => {
      finish()
      reject(
        new ApiError(
          'network_error',
          'Could not reach the server. Check your connection and try again.',
          null,
          0,
        ),
      )
    }
    request.onabort = () => {
      finish()
      reject(new DOMException('The upload was cancelled.', 'AbortError'))
    }
    request.send(body)
  })
}

export const apiGet = <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
  apiRequest<T>('GET', path, options)

export const apiPost = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>('POST', path, { ...options, body })

export const apiPut = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>('PUT', path, { ...options, body })

export const apiPatch = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>('PATCH', path, { ...options, body })

export const apiDelete = <T>(path: string, options?: RequestOptions) =>
  apiRequest<T>('DELETE', path, options)
