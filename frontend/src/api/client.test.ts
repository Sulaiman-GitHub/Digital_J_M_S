import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeXhr, installFakeXhr } from '../test/fakeXhr'
import { jsonResponse } from '../test/utils'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload, CSRF_HEADER } from './client'
import { ApiError } from './types'

const fetchMock = vi.fn<typeof fetch>()

function lastInit(): RequestInit {
  const call = fetchMock.mock.calls.at(-1)
  if (!call?.[1]) throw new Error('fetch was not called with init')
  return call[1]
}

function lastHeaders(): Record<string, string> {
  return lastInit().headers as Record<string, string>
}

function setCookie(value: string) {
  document.cookie = value
}

function clearCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => jsonResponse({ data: { ok: true } }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearCookie('djm_csrf')
})

describe('CSRF header', () => {
  it('is sent on unsafe methods using the djm_csrf cookie', async () => {
    setCookie('djm_csrf=token%20123')

    for (const call of [
      () => apiPost('/api/v1/x', { a: 1 }),
      () => apiPut('/api/v1/x', { a: 1 }),
      () => apiPatch('/api/v1/x', { a: 1 }),
      () => apiDelete('/api/v1/x'),
    ]) {
      await call()
      expect(lastHeaders()[CSRF_HEADER]).toBe('token 123')
    }
  })

  it('is not sent on GET', async () => {
    setCookie('djm_csrf=abc')

    await apiGet('/api/v1/x')

    expect(lastHeaders()[CSRF_HEADER]).toBeUndefined()
  })

  it('is omitted when there is no cookie', async () => {
    await apiPost('/api/v1/x', {})

    expect(lastHeaders()[CSRF_HEADER]).toBeUndefined()
  })
})

describe('requests', () => {
  it('include credentials and send JSON bodies', async () => {
    await apiPost('/api/v1/x', { email: 'a@b.ug' })

    const init = lastInit()
    expect(init.credentials).toBe('include')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.ug' }))
    expect(lastHeaders()['Content-Type']).toBe('application/json')
  })

  it('return the parsed JSON body on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { status: 'ok' } }))

    await expect(apiGet('/api/v1/health')).resolves.toEqual({ data: { status: 'ok' } })
  })
})

describe('errors', () => {
  it('parse the error envelope into ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'validation_error',
            message: 'Some fields are invalid.',
            details: { fields: { email: 'Invalid email' } },
          },
        },
        422,
      ),
    )

    const error = await apiPost('/api/v1/x', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'validation_error',
      message: 'Some fields are invalid.',
      details: { fields: { email: 'Invalid email' } },
      status: 422,
    })
  })

  it('turn a non-JSON error response into ApiError', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }))

    const error = await apiGet('/api/v1/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'unexpected_response', status: 502 })
  })

  it('turn a network failure into ApiError with status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const error = await apiGet('/api/v1/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'network_error', status: 0 })
  })
})

describe('apiUpload', () => {
  beforeEach(() => {
    installFakeXhr()
    setCookie('djm_csrf=upload-token')
  })
  afterEach(() => {
    clearCookie('djm_csrf')
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', fetchMock)
  })

  const form = () => {
    const data = new FormData()
    data.append('file', new File(['%PDF'], 'cv.pdf'))
    return data
  }

  it('posts the form with cookies, the CSRF header and a JSON Accept header', async () => {
    const result = apiUpload<{ data: string }>('/api/v1/cv/me', form())
    const request = FakeXhr.last()

    request.respond(201, { data: 'ok' })

    await expect(result).resolves.toEqual({ data: 'ok' })
    expect(request.method).toBe('POST')
    expect(request.withCredentials).toBe(true)
    expect(request.headers[CSRF_HEADER]).toBe('upload-token')
    expect(request.headers.Accept).toBe('application/json')
    expect(request.headers).not.toHaveProperty('Content-Type') // the browser sets the boundary
  })

  it('reports progress as a whole percentage', () => {
    const seen: number[] = []
    void apiUpload('/api/v1/cv/me', form(), { onProgress: (percent) => seen.push(percent) }).catch(
      () => undefined,
    )

    FakeXhr.last().progress(1, 3)
    FakeXhr.last().progress(3, 3)

    expect(seen).toEqual([33, 100])
  })

  it('turns the error envelope into ApiError', async () => {
    const result = apiUpload('/api/v1/cv/me', form())

    FakeXhr.last().respond(413, {
      error: { code: 'file_too_large', message: 'Too big.', details: null },
    })

    await expect(result).rejects.toMatchObject({
      code: 'file_too_large',
      message: 'Too big.',
      status: 413,
    })
  })

  it('turns an unreadable error into ApiError', async () => {
    const result = apiUpload('/api/v1/cv/me', form())
    const request = FakeXhr.last()
    request.status = 502
    request.responseText = '<html>Bad gateway</html>'
    request.onload?.()

    await expect(result).rejects.toMatchObject({ code: 'unexpected_response', status: 502 })
  })

  it('turns a network failure into ApiError with status 0', async () => {
    const result = apiUpload('/api/v1/cv/me', form())

    FakeXhr.last().fail()

    await expect(result).rejects.toMatchObject({ code: 'network_error', status: 0 })
  })

  it('rejects with an AbortError when the signal aborts', async () => {
    const controller = new AbortController()
    const result = apiUpload('/api/v1/cv/me', form(), { signal: controller.signal })

    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeXhr.last().aborted).toBe(true)
  })
})
