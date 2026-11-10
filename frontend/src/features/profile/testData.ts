// Fixtures for profile tests. Names and places are fictional samples.
import type {
  District,
  FieldOfStudy,
  Institution,
  Profile,
  ProfileInput,
  QualificationLevel,
  Skill,
} from '../../api/types'
import { apiError, loggedIn, makeUser, okData } from '../../test/utils'

export const GULU = '11111111-1111-4111-8111-111111111111'
export const MBARARA = '11111111-1111-4111-8111-222222222222'
export const BACHELORS = '22222222-2222-4222-8222-222222222222'
export const DIPLOMA = '22222222-2222-4222-8222-333333333333'
export const GULU_UNIVERSITY = '33333333-3333-4333-8333-333333333333'
export const LIRA_UNIVERSITY = '33333333-3333-4333-8333-444444444444'
export const ACCOUNTING = '44444444-4444-4444-8444-444444444444'
export const PYTHON = '55555555-5555-4555-8555-555555555555'
export const EXCEL = '55555555-5555-4555-8555-666666666666'

export const districts: District[] = [
  { id: GULU, name: 'Gulu', region: 'Northern' },
  { id: MBARARA, name: 'Mbarara', region: 'Western' },
]
export const levels: QualificationLevel[] = [
  { id: DIPLOMA, name: 'Diploma', rank: 2 },
  { id: BACHELORS, name: "Bachelor's degree", rank: 3 },
]
export const institutions: Institution[] = [
  {
    id: GULU_UNIVERSITY,
    name: 'Gulu University',
    institution_type: 'university',
    district_id: GULU,
  },
  {
    id: LIRA_UNIVERSITY,
    name: 'Lira University',
    institution_type: 'university',
    district_id: null,
  },
]
export const fields: FieldOfStudy[] = [{ id: ACCOUNTING, name: 'Accounting' }]
export const skills: Skill[] = [
  { id: PYTHON, name: 'Python' },
  { id: EXCEL, name: 'Microsoft Excel' },
]

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    full_name: 'Nakato Sarah',
    phone: '+256772123456',
    date_of_birth: '2001-05-17',
    institution_id: GULU_UNIVERSITY,
    institution_other_name: null,
    qualification_level_id: BACHELORS,
    field_of_study_id: ACCOUNTING,
    field_of_study_other: null,
    study_status: 'completed',
    expected_completion_date: null,
    graduation_date: '2025-07-15',
    district_id: GULU,
    summary: null,
    skills: [],
    experiences: [],
    created_at: '2026-11-05T09:00:00Z',
    updated_at: '2026-11-05T09:00:00Z',
    ...overrides,
  }
}

export const PROFILE_PATH = 'GET /api/v1/profile/me'
export const PUT_PROFILE = 'PUT /api/v1/profile/me'

/** Routes every profile page test needs: a logged-in seeker, the lists, and skill search. */
export function profileRoutes(profile: Profile | null = null) {
  return {
    ...loggedIn(makeUser({ role: 'job_seeker' })),
    'GET /api/v1/reference/districts': () => okData(districts),
    'GET /api/v1/reference/qualification-levels': () => okData(levels),
    'GET /api/v1/reference/institutions': () => okData(institutions),
    'GET /api/v1/reference/fields-of-study': () => okData(fields),
    'GET /api/v1/reference/skills?q=*': (request: { path: string }) => {
      const q = decodeURIComponent(request.path.split('?q=')[1] ?? '').toLowerCase()
      return okData(skills.filter((skill) => skill.name.toLowerCase().includes(q)))
    },
    'GET /api/v1/cv/me': () => apiError(404, 'cv_not_found', 'You have not uploaded a CV yet.'),
    'GET /api/v1/consents/me': () =>
      okData([
        { consent_type: 'terms', policy_version: 'v1', granted_at: '2026-11-05T09:00:00Z' },
        { consent_type: 'privacy', policy_version: 'v1', granted_at: '2026-11-05T09:00:00Z' },
      ]),
    [PROFILE_PATH]: () =>
      profile
        ? okData(profile)
        : apiError(404, 'profile_not_found', 'You have not created your profile yet.'),
  }
}

/** What the server would answer for a PUT: the saved profile built from the input. */
export function profileFromInput(input: ProfileInput, base: Profile = makeProfile()): Profile {
  const { skill_ids: skillIds, experiences, ...rest } = input
  return {
    ...base,
    ...rest,
    skills: skillIds.map((id) => skills.find((skill) => skill.id === id) ?? { id, name: 'Skill' }),
    experiences: experiences.map((entry, index) => ({ id: `experience-${index}`, ...entry })),
  }
}
