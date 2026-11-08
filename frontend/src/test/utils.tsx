import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom'
import { vi } from 'vitest'
import type { User } from '../api/types'
import { ToastProvider } from '../components/ToastProvider'
import { AuthProvider } from '../features/auth/AuthProvider'

/** Render with a fresh QueryClient (no retries, no cache sharing) and a router. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
      options,
    ),
  }
}

/** Like renderWithProviders, plus toasts and the auth state (which calls GET /auth/me). */
export function renderWithAuth(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>,
      options,
    ),
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A success response: { data }. */
export function okData(data: unknown, status = 200): Response {
  return jsonResponse({ data }, status)
}

/** An error response in the API's error envelope. */
export function apiError(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> | null = null,
): Response {
  return jsonResponse({ error: { code, message, details } }, status)
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '26560d50-fdab-436a-8af3-07affd11269f',
    email: 'nakato@example.com',
    role: 'job_seeker',
    status: 'active',
    email_verified: true,
    employer_status: null,
    created_at: '2026-11-05T09:00:00Z',
    ...overrides,
  }
}

export interface RecordedRequest {
  method: string
  path: string
  body: unknown
  headers: Record<string, string>
}

type Handler = (request: RecordedRequest) => Response | Promise<Response>

/**
 * Replace fetch with a fake API. Routes are keyed "METHOD /path". Unknown routes answer 404.
 * `calls` records every request, so tests can check what was sent.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: RecordedRequest[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: RecordedRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: String(input),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    }
    calls.push(request)
    const key = `${request.method} ${request.path}`
    // An exact route wins; a route ending in "*" matches any path that starts the same way.
    const handler =
      routes[key] ??
      Object.entries(routes).find(
        ([pattern]) => pattern.endsWith('*') && key.startsWith(pattern.slice(0, -1)),
      )?.[1]
    if (!handler) {
      return apiError(404, 'not_found', `Unmocked ${request.method} ${request.path}`)
    }
    return handler(request)
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    calls,
    callsTo: (method: string, path: string) =>
      calls.filter((call) => call.method === method && call.path === path),
  }
}

export const ME = 'GET /api/v1/auth/me'

/** Routes for a visitor with no session. */
export const loggedOut: Record<string, Handler> = {
  [ME]: () => apiError(401, 'not_authenticated', 'Please log in to continue.'),
}

/** Routes for a logged-in user. */
export function loggedIn(user: User = makeUser()): Record<string, Handler> {
  return { [ME]: () => okData(user) }
}

/**
 * Like renderWithAuth, but inside a data router (createMemoryRouter), which is what
 * useBlocker (unsaved-changes warning) needs. Pass the app's routes for the page under test.
 */
export function renderRoutes(routes: RouteObject[], { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const router = createMemoryRouter(routes, { initialEntries: [route] })
  return {
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  }
}
