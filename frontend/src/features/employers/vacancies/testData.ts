import type { ManagedVacancy, PagedResponse } from '../../../api/types'
import { jsonResponse, okData } from '../../../test/utils'
import { employerRoutes, makeEmployer } from '../testData'

export { GULU, KAMPALA, districts } from '../testData'

export const SKILLS = [
  { id: 'sk1', name: 'Microsoft Excel' },
  { id: 'sk2', name: 'Python' },
]

export function makeManaged(overrides: Partial<ManagedVacancy> = {}): ManagedVacancy {
  return {
    id: 'v1',
    employer_id: 'e1',
    application_count: 0,
    new_application_count: 0,
    title: 'Accounts Assistant',
    description: 'Prepare invoices.',
    employment_type: 'full_time',
    work_arrangement: 'onsite',
    district_id: '6c1f3f0e-0000-4000-8000-000000000002',
    min_qualification_level_id: null,
    min_experience_years: 1,
    salary_min: null,
    salary_max: null,
    show_salary: false,
    application_method: 'internal',
    external_url: null,
    status: 'draft',
    published_at: null,
    expires_at: null,
    is_live: false,
    created_by_admin: false,
    requirements: [],
    created_at: '2026-11-05T09:00:00Z',
    updated_at: '2026-11-05T09:00:00Z',
    ...overrides,
  }
}

export function listOf(items: ManagedVacancy[], total = items.length, page = 1) {
  const body: PagedResponse<ManagedVacancy> = {
    data: items,
    meta: { page, page_size: 20, total },
  }
  return jsonResponse(body)
}

export const MINE = 'GET /api/v1/employer/vacancies*'
export const CREATE = 'POST /api/v1/employer/vacancies'

/** Routes for the vacancy screens: an approved (or other) employer, lists, skills search. */
export function vacancyRoutes(
  status: 'approved' | 'pending' | 'draft' | 'suspended' | 'rejected' = 'approved',
  items: ManagedVacancy[] = [],
) {
  return {
    ...employerRoutes(
      makeEmployer({ verification_status: status, can_publish: status === 'approved' }),
    ),
    'GET /api/v1/reference/qualification-levels': () =>
      okData([{ id: 'l1', name: "Bachelor's degree", rank: 3 }]),
    'GET /api/v1/reference/skills?q=*': () => okData(SKILLS),
    [MINE]: () => listOf(items),
  }
}
