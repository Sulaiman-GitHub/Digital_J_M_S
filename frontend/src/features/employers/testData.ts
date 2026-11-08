import type {
  AdminEmployerDetail,
  AdminEmployerItem,
  Employer,
  VerificationStatus,
} from '../../api/types'
import { apiError, jsonResponse, loggedIn, makeUser, okData } from '../../test/utils'

export const GULU = '6c1f3f0e-0000-4000-8000-000000000001'
export const KAMPALA = '6c1f3f0e-0000-4000-8000-000000000002'

export const districts = [
  { id: GULU, name: 'Gulu', region: 'Northern' },
  { id: KAMPALA, name: 'Kampala', region: 'Central' },
]

export function makeEmployer(overrides: Partial<Employer> = {}): Employer {
  return {
    id: 'e1',
    company_name: 'Ssese Foods Ltd',
    registration_number: '80020012345678',
    website: 'https://ssese-foods.example.com',
    contact_phone: '+256414123456',
    district_id: KAMPALA,
    description: 'We process and sell fruit juice.',
    verification_status: 'draft',
    status_reason: null,
    can_publish: false,
    submitted_at: null,
    decided_at: null,
    created_at: '2026-11-05T09:00:00Z',
    updated_at: '2026-11-05T09:00:00Z',
    ...overrides,
  }
}

export const EMPLOYER_PATH = 'GET /api/v1/employer/me'
export const PUT_EMPLOYER = 'PUT /api/v1/employer/me'
export const SUBMIT_EMPLOYER = 'POST /api/v1/employer/me/submit'

/** Routes every employer page test needs: a logged-in employer, the districts and the company. */
export function employerRoutes(
  employer: Employer | null = null,
  options: { emailVerified?: boolean } = {},
) {
  return {
    ...loggedIn(makeUser({ role: 'employer', email_verified: options.emailVerified ?? true })),
    'GET /api/v1/reference/districts': () => okData(districts),
    'GET /api/v1/reference/qualification-levels': () => okData([]),
    'GET /api/v1/employer/vacancies*': () =>
      jsonResponse({ data: [], meta: { page: 1, page_size: 20, total: 0 } }),
    [EMPLOYER_PATH]: () =>
      employer
        ? okData(employer)
        : apiError(404, 'employer_not_found', 'You have not created your company profile yet.'),
  }
}

export function makeDetail(overrides: Partial<AdminEmployerDetail> = {}): AdminEmployerDetail {
  return {
    id: 'e1',
    owner: { id: 'u1', email: 'hr@ssese-foods.example.com', email_verified: true },
    company_name: 'Ssese Foods Ltd',
    registration_number: '80020012345678',
    website: 'https://ssese-foods.example.com',
    contact_phone: '+256414123456',
    district_id: KAMPALA,
    district_name: 'Kampala',
    description: 'We process and sell fruit juice.',
    verification_status: 'pending',
    submitted_at: '2026-11-06T06:12:00Z',
    decided_at: null,
    created_at: '2026-11-05T09:00:00Z',
    history: [
      {
        id: 'h1',
        from_status: 'draft',
        to_status: 'pending',
        actor_email: 'hr@ssese-foods.example.com',
        reason: null,
        created_at: '2026-11-06T06:12:00Z',
      },
    ],
    ...overrides,
  }
}

export function makeItem(
  name: string,
  status: VerificationStatus = 'pending',
  id = name.toLowerCase().replace(/\W+/g, '-'),
): AdminEmployerItem {
  return {
    id,
    company_name: name,
    owner_email: `hr@${id}.example.com`,
    district_name: 'Kampala',
    verification_status: status,
    submitted_at: status === 'draft' ? null : '2026-11-06T06:12:00Z',
    decided_at: null,
  }
}
