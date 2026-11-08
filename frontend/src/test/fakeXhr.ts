import { vi } from 'vitest'

/** A stand-in for XMLHttpRequest that lets a test decide when and how the upload ends. */
export class FakeXhr {
  static instances: FakeXhr[] = []

  method = ''
  url = ''
  body: unknown = null
  status = 0
  responseText = ''
  withCredentials = false
  headers: Record<string, string> = {}
  upload: { onprogress: ((event: unknown) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  aborted = false

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }

  send(body: unknown) {
    this.body = body
    FakeXhr.instances.push(this)
  }

  abort() {
    this.aborted = true
    this.onabort?.()
  }

  /** Report that `loaded` of `total` bytes were sent. */
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }

  /** The server answered. */
  respond(status: number, payload: unknown) {
    this.status = status
    this.responseText = payload === null ? '' : JSON.stringify(payload)
    this.onload?.()
  }

  /** The network failed. */
  fail() {
    this.onerror?.()
  }

  static last(): FakeXhr {
    const request = FakeXhr.instances.at(-1)
    if (!request) throw new Error('No upload was started')
    return request
  }
}

/** Replace XMLHttpRequest with FakeXhr for the current test. Call vi.unstubAllGlobals() after. */
export function installFakeXhr(): typeof FakeXhr {
  FakeXhr.instances = []
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  return FakeXhr
}
