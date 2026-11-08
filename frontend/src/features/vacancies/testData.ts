import type { PagedResponse, QualificationLevel, VacancyCard, VacancyDetail } from '../../api/types'
import { apiError, jsonResponse, loggedOut, okData, type RecordedRequest } from '../../test/utils'

export const GULU = '6c1f3f0e-0000-4000-8000-000000000001'
export const KAMPALA = '6c1f3f0e-0000-4000-8000-000000000002'
export const DEGREE = '6c1f3f0e-0000-4000-8000-0000000000a1'
export const DIPLOMA = '6c1f3f0e-0000-4000-8000-0000000000a2'

export const districts = [
  { id: GULU, name: 'Gulu', region: 'Northern' },
  { id: KAMPALA, name: 'Kampala', region: 'Central' },
]

export const levels: QualificationLevel[] = [
  { id: DIPLOMA, name: 'Diploma', rank: 2 },
  { id: DEGREE, name: "Bachelor's degree", rank: 3 },
]

/** A fixed "now" so relative dates in tests do not depend on the clock. */
export const NOW = new Date('2026-11-06T09:00:00Z')

export function makeCard(overrides: Partial<VacancyCard> = {}): VacancyCard {
  return {
    id: 'v1',
    title: 'Accounts Assistant',
    company_name: 'Ssese Foods Ltd',
    district_id: KAMPALA,
    district_name: 'Kampala',
    employment_type: 'full_time',
    work_arrangement: 'onsite',
    published_at: '2026-11-03T09:00:00Z',
    expires_at: '2026-12-20T09:00:00Z',
    salary_min: null,
    salary_max: null,
    ...overrides,
  }
}

export function makeDetail(overrides: Partial<VacancyDetail> = {}): VacancyDetail {
  return {
    id: 'v1',
    title: 'Accounts Assistant',
    description: 'Prepare invoices.\nReconcile accounts.',
    employment_type: 'full_time',
    work_arrangement: 'onsite',
    district_id: KAMPALA,
    district_name: 'Kampala',
    min_qualification_level_id: DEGREE,
    min_qualification_level_name: "Bachelor's degree",
    min_experience_years: 2,
    salary_min: 1_200_000,
    salary_max: 1_500_000,
    application_method: 'internal',
    external_url: null,
    published_at: '2026-11-03T09:00:00Z',
    expires_at: '2026-11-28T09:00:00Z',
    requirements: [
      { id: 'r1', kind: 'skill', skill_id: 's1', label: 'Microsoft Excel', is_mandatory: true },
      {
        id: 'r2',
        kind: 'qualification',
        skill_id: null,
        label: 'Degree in accounting',
        is_mandatory: true,
      },
      { id: 'r3', kind: 'certification', skill_id: null, label: 'CPA Part 1', is_mandatory: false },
    ],
    employer: { company_name: 'Ssese Foods Ltd', district_name: 'Kampala' },
    ...overrides,
  }
}

export function pageOf(
  cards: VacancyCard[],
  total = cards.length,
  page = 1,
  pageSize = 20,
): PagedResponse<VacancyCard> {
  return { data: cards, meta: { page, page_size: pageSize, total } }
}

export const LIST = 'GET /api/v1/vacancies*'

export function queryOf(request: Pick<RecordedRequest, 'path'>): URLSearchParams {
  return new URLSearchParams(request.path.split('?')[1] ?? '')
}

/** The routes every public page test needs: a visitor, and the two filter lists. */
export function publicRoutes() {
  return {
    ...loggedOut,
    'GET /api/v1/reference/districts': () => okData(districts),
    'GET /api/v1/reference/qualification-levels': () => okData(levels),
  }
}

export const listResponse = (body: PagedResponse<VacancyCard>) => jsonResponse(body)
export const notFound = () => apiError(404, 'vacancy_not_found', 'This vacancy does not exist.')
