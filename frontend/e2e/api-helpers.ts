import { expect, type APIRequestContext } from '@playwright/test'
import { ADMIN_EMAIL, ADMIN_PASSWORD, PASSWORD, linkPath, waitForEmail } from './helpers.ts'

// Shared by the end-to-end specs: users and vacancies set up through the API, which is much faster
// than clicking through the screens when a test is about something else.

export type Playwright = {
  request: { newContext: (options: { baseURL: string }) => Promise<APIRequestContext> }
}

export interface ApiUser {
  api: APIRequestContext
  headers: Record<string, string>
}

export async function apiLogin(
  playwright: Playwright,
  baseURL: string,
  email: string,
  password = PASSWORD,
): Promise<ApiUser> {
  const api = await playwright.request.newContext({ baseURL })
  const login = await api.post('/api/v1/auth/login', { data: { email, password } })
  expect(login.status()).toBe(200)
  const { cookies } = await api.storageState()
  const csrf = cookies.find((cookie: { name: string }) => cookie.name === 'djm_csrf')?.value ?? ''
  return { api, headers: { 'X-CSRF-Token': csrf } }
}

export async function adminByApi(playwright: Playwright, baseURL: string): Promise<ApiUser> {
  return apiLogin(playwright, baseURL, ADMIN_EMAIL, ADMIN_PASSWORD)
}

/** Register, confirm the email address through the test inbox, and log in. */
export async function verifiedUserByApi(
  playwright: Playwright,
  baseURL: string,
  request: APIRequestContext,
  email: string,
  role: 'employer' | 'job_seeker' = 'employer',
): Promise<ApiUser> {
  const anonymous = await playwright.request.newContext({ baseURL })
  const registered = await anonymous.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, role, accept_terms: true },
  })
  expect(registered.status()).toBe(201)
  const message = await waitForEmail(request, email, 'Confirm your email address')
  const token = new URL(linkPath(message), 'http://localhost').searchParams.get('token')
  const verified = await anonymous.post('/api/v1/auth/verify-email', { data: { token } })
  expect(verified.status()).toBe(200)
  await anonymous.dispose()
  return apiLogin(playwright, baseURL, email)
}

export async function firstDistrictId(user: ApiUser): Promise<string> {
  const response = await user.api.get('/api/v1/reference/districts')
  return ((await response.json()) as { data: { id: string }[] }).data[0].id
}

/** Fill in the company profile and send it for verification. Returns the employer id. */
export async function submitCompanyByApi(user: ApiUser, companyName: string): Promise<string> {
  const saved = await user.api.put('/api/v1/employer/me', {
    headers: user.headers,
    data: {
      company_name: companyName,
      registration_number: '80020012345678',
      contact_phone: '0414 123456',
      description: 'We make and sell fruit juice.',
      district_id: await firstDistrictId(user),
    },
  })
  expect(saved.status()).toBe(200)
  const id = ((await saved.json()) as { data: { id: string } }).data.id
  const submitted = await user.api.post('/api/v1/employer/me/submit', { headers: user.headers })
  expect(submitted.status()).toBe(200)
  return id
}

/** A verified employer whose company the e2e admin has approved. */
export async function approvedEmployerByApi(
  playwright: Playwright,
  baseURL: string,
  request: APIRequestContext,
  email: string,
  companyName: string,
): Promise<ApiUser & { employerId: string }> {
  const employer = await verifiedUserByApi(playwright, baseURL, request, email)
  const employerId = await submitCompanyByApi(employer, companyName)
  const admin = await adminByApi(playwright, baseURL)
  const approved = await admin.api.post(`/api/v1/admin/employers/${employerId}/approve`, {
    headers: admin.headers,
  })
  expect(approved.status()).toBe(200)
  await admin.api.dispose()
  return { ...employer, employerId }
}

/** A made-up word that appears nowhere else, so a search for it finds exactly one vacancy. */
export function uniqueWord(prefix = 'brewmaster'): string {
  const letters = Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join('')
  return `${prefix}${letters}`
}

export interface NewVacancy {
  title: string
  description?: string
  employment_type?: string
  work_arrangement?: string
  days?: number
}

/** Create a vacancy as an employer, and optionally publish it. Returns its id. */
export async function createVacancyByApi(
  user: ApiUser,
  vacancy: NewVacancy,
  publish = true,
): Promise<string> {
  const created = await user.api.post('/api/v1/employer/vacancies', {
    headers: user.headers,
    data: {
      title: vacancy.title,
      description: vacancy.description ?? 'Prepare, pack and deliver our products.',
      employment_type: vacancy.employment_type ?? 'full_time',
      work_arrangement: vacancy.work_arrangement ?? 'onsite',
      district_id: await firstDistrictId(user),
      expires_at: new Date(Date.now() + (vacancy.days ?? 20) * 24 * 3600 * 1000).toISOString(),
    },
  })
  expect(created.status()).toBe(201)
  const id = ((await created.json()) as { data: { id: string } }).data.id
  if (publish) {
    const published = await user.api.post(`/api/v1/employer/vacancies/${id}/publish`, {
      headers: user.headers,
    })
    expect(published.status()).toBe(200)
  }
  return id
}

/** A small but real-looking PDF. The first bytes are what the server checks. */
export function pdfBytes(label: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Title (${label}) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
  )
}

/**
 * A verified job seeker who is ready to apply: profile filled in, a CV uploaded and the
 * CV-sharing consent given. Done through the API, which is much faster than the screens.
 */
export async function readySeekerByApi(
  playwright: Playwright,
  baseURL: string,
  request: APIRequestContext,
  email: string,
  fullName = 'Nakato Sarah',
): Promise<ApiUser> {
  const seeker = await verifiedUserByApi(playwright, baseURL, request, email, 'job_seeker')
  const levels = await seeker.api.get('/api/v1/reference/qualification-levels')
  const level = ((await levels.json()) as { data: { id: string }[] }).data[0].id
  const profile = await seeker.api.put('/api/v1/profile/me', {
    headers: seeker.headers,
    data: {
      full_name: fullName,
      phone: '0772 123456',
      institution_other_name: 'Gulu University',
      qualification_level_id: level,
      field_of_study_other: 'Accounting',
      study_status: 'completed',
      graduation_date: '2025-07-15',
      district_id: await firstDistrictId(seeker),
      summary: 'Recent accounting graduate.',
    },
  })
  expect(profile.status()).toBe(200)
  const cv = await seeker.api.post('/api/v1/cv/me', {
    headers: seeker.headers,
    multipart: {
      file: { name: 'my-cv.pdf', mimeType: 'application/pdf', buffer: pdfBytes(email) },
    },
  })
  expect(cv.status()).toBe(201)
  const consent = await seeker.api.post('/api/v1/consents', {
    headers: seeker.headers,
    data: { consent_type: 'cv_sharing_with_employers', granted: true },
  })
  expect(consent.status()).toBe(200)
  return seeker
}

/** Apply to a vacancy through the API. Returns the application id. */
export async function applyByApi(
  seeker: ApiUser,
  vacancyId: string,
  coverNote: string | null = null,
): Promise<string> {
  const response = await seeker.api.post(`/api/v1/vacancies/${vacancyId}/applications`, {
    headers: seeker.headers,
    data: { cover_note: coverNote },
  })
  expect(response.status()).toBe(201)
  return ((await response.json()) as { data: { id: string } }).data.id
}
