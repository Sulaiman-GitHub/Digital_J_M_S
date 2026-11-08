import { describe, expect, it } from 'vitest'
import type { ManagedVacancy } from '../../../api/types'
import {
  MAX_DAYS_AHEAD,
  closingRange,
  createDraftSchema,
  emptyVacancy,
  formFieldForServerKey,
  fromExpiresAt,
  fromVacancy,
  publishProblems,
  toExpiresAt,
  toPayload,
  type VacancyFormValues,
} from './vacancySchema'

const NOW = new Date('2026-11-06T09:00:00Z') // 12:00 on 6 Nov in Kampala
const range = closingRange(null, NOW)
const schema = createDraftSchema(range)

const valid: VacancyFormValues = { ...emptyVacancy, title: 'Accounts Assistant' }
const complete: VacancyFormValues = {
  ...valid,
  description: 'Prepare invoices.',
  employment_type: 'full_time',
  work_arrangement: 'onsite',
  district_id: 'd1',
  closing_date: '2026-12-01',
}
const problems = (values: object) => {
  const result = schema.safeParse(values)
  return result.success
    ? []
    : [...new Set(result.error.issues.map((issue) => String(issue.path[0])))]
}

describe('closing dates', () => {
  it('offers today to 89 days later', () => {
    expect(range).toEqual({ min: '2026-11-06', max: '2027-02-03' })
    expect(MAX_DAYS_AHEAD).toBe(89)
  })

  it('counts the limit from the publish date for a published vacancy', () => {
    expect(closingRange('2026-10-01T09:00:00Z', NOW)).toEqual({
      min: '2026-11-06',
      max: '2026-12-29',
    })
  })

  it('uses the Kampala date, not the UTC date, near midnight', () => {
    const lateEvening = new Date('2026-11-06T21:30:00Z') // already 7 Nov in Kampala
    expect(closingRange(null, lateEvening).min).toBe('2026-11-07')
  })

  it('closes at the end of the chosen day in Kampala, and reads it back', () => {
    expect(toExpiresAt('2026-12-01')).toBe('2026-12-01T23:59:00+03:00')
    expect(new Date(toExpiresAt('2026-12-01')).toISOString()).toBe('2026-12-01T20:59:00.000Z')
    expect(fromExpiresAt('2026-12-01T20:59:00Z')).toBe('2026-12-01')
    expect(fromExpiresAt(null)).toBe('')
  })

  it('the latest date offered, at the end of the day, is still within 90 days of now', () => {
    const latest = new Date(toExpiresAt(range.max)).getTime()
    expect(latest - NOW.getTime()).toBeLessThanOrEqual(90 * 24 * 3600 * 1000)
  })
})

describe('draft rules', () => {
  it('needs only a title', () => {
    expect(problems(valid)).toEqual([])
    expect(problems(emptyVacancy)).toEqual(['title'])
  })

  it.each([
    ['title', ' '],
    ['title', 'ab'],
    ['title', 'x'.repeat(201)],
    ['description', 'x'.repeat(10_001)],
    ['min_experience_years', '-1'],
    ['min_experience_years', '51'],
    ['min_experience_years', 'two'],
    ['salary_min', '-5'],
    ['salary_min', '1.5'],
    ['salary_max', '10000000001'],
    ['salary_max', 'lots'],
    ['external_url', 'x'.repeat(501)],
    ['closing_date', '2026-11-05'],
    ['closing_date', '2027-02-04'],
  ])('refuses %s = %s…', (name, value) => {
    const extra = name === 'external_url' ? { application_method: 'external' } : {}
    expect(problems({ ...valid, ...extra, [name]: value })).toContain(name)
  })

  it('accepts the edges', () => {
    expect(
      problems({
        ...valid,
        title: 'x'.repeat(200),
        description: 'x'.repeat(10_000),
        min_experience_years: '50',
        salary_min: '0',
        salary_max: '10000000000',
        closing_date: range.min,
      }),
    ).toEqual([])
    expect(problems({ ...valid, closing_date: range.max })).toEqual([])
  })

  it('the highest pay cannot be below the lowest', () => {
    expect(problems({ ...valid, salary_min: '2000000', salary_max: '1000000' })).toEqual([
      'salary_max',
    ])
    expect(problems({ ...valid, salary_min: '1000000', salary_max: '1000000' })).toEqual([])
    expect(problems({ ...valid, salary_min: '1000000', salary_max: '' })).toEqual([])
  })

  it('an external link must be https, an internal vacancy ignores it', () => {
    const external = { ...valid, application_method: 'external' as const }
    expect(problems({ ...external, external_url: 'http://x.example.com' })).toEqual([
      'external_url',
    ])
    expect(problems({ ...external, external_url: 'javascript:alert(1)' })).toEqual(['external_url'])
    expect(problems({ ...external, external_url: 'https://has space.com' })).toEqual([
      'external_url',
    ])
    expect(problems({ ...external, external_url: 'https://jobs.example.com/1' })).toEqual([])
    expect(problems({ ...external, external_url: '' })).toEqual([]) // only publishing needs it
    expect(
      problems({ ...valid, application_method: 'internal', external_url: 'nonsense' }),
    ).toEqual([])
  })

  it('requirements: a label is needed for typed ones, and at most twenty in all', () => {
    const other = { kind: 'certification' as const, label: 'CPA', is_mandatory: false }
    expect(problems({ ...valid, others: [{ ...other, label: '  ' }] })).toEqual(['others'])
    const skills = Array.from({ length: 15 }, (_, i) => ({
      id: `s${i}`,
      name: `S${i}`,
      is_mandatory: false,
    }))
    const others = Array.from({ length: 5 }, () => other)
    expect(problems({ ...valid, skills, others })).toEqual([])
    expect(problems({ ...valid, skills, others: [...others, other] })).toEqual(['requirements'])
  })
})

describe('what publishing needs', () => {
  it('a complete vacancy has no problems', () => {
    expect(publishProblems(complete)).toEqual({})
  })

  it('names every missing item', () => {
    expect(Object.keys(publishProblems(valid)).sort()).toEqual([
      'closing_date',
      'description',
      'district_id',
      'employment_type',
      'work_arrangement',
    ])
  })

  it('remote jobs need no district; other places do', () => {
    expect(publishProblems({ ...complete, work_arrangement: 'remote', district_id: '' })).toEqual(
      {},
    )
    expect(
      Object.keys(publishProblems({ ...complete, work_arrangement: 'hybrid', district_id: '' })),
    ).toEqual(['district_id'])
  })

  it('an external vacancy needs its link, an internal one does not', () => {
    expect(Object.keys(publishProblems({ ...complete, application_method: 'external' }))).toEqual([
      'external_url',
    ])
    expect(
      publishProblems({
        ...complete,
        application_method: 'external',
        external_url: 'https://x.example.com',
      }),
    ).toEqual({})
  })

  it('a description of only spaces counts as missing', () => {
    expect(Object.keys(publishProblems({ ...complete, description: '   ' }))).toEqual([
      'description',
    ])
  })
})

describe('values and the API', () => {
  it('builds the payload: numbers, nulls, closing time, requirements in order', () => {
    expect(
      toPayload({
        ...complete,
        title: '  Accounts Assistant ',
        description: ' About ',
        min_experience_years: '2',
        salary_min: '800000',
        salary_max: ' 1200000 ',
        show_salary: true,
        min_qualification_level_id: 'l1',
        skills: [{ id: 's1', name: 'Python', is_mandatory: true }],
        others: [{ kind: 'certification', label: ' CPA ', is_mandatory: false }],
      }),
    ).toEqual({
      title: 'Accounts Assistant',
      description: 'About',
      employment_type: 'full_time',
      work_arrangement: 'onsite',
      district_id: 'd1',
      min_qualification_level_id: 'l1',
      min_experience_years: 2,
      salary_min: 800000,
      salary_max: 1200000,
      show_salary: true,
      application_method: 'internal',
      external_url: null,
      expires_at: '2026-12-01T23:59:00+03:00',
      requirements: [
        { kind: 'skill', skill_id: 's1', label: null, is_mandatory: true },
        { kind: 'certification', skill_id: null, label: 'CPA', is_mandatory: false },
      ],
    })
  })

  it('sends empty fields as null and an empty experience as 0', () => {
    expect(toPayload({ ...valid, min_experience_years: '' })).toMatchObject({
      description: null,
      employment_type: null,
      work_arrangement: null,
      district_id: null,
      min_qualification_level_id: null,
      min_experience_years: 0,
      salary_min: null,
      salary_max: null,
      expires_at: null,
      requirements: [],
    })
  })

  it('drops the link for an internal vacancy', () => {
    expect(
      toPayload({ ...valid, application_method: 'internal', external_url: 'https://x.example.com' })
        .external_url,
    ).toBeNull()
    expect(
      toPayload({
        ...valid,
        application_method: 'external',
        external_url: ' https://x.example.com ',
      }).external_url,
    ).toBe('https://x.example.com')
  })

  it('reads a vacancy back into the form, splitting skills from the other requirements', () => {
    const vacancy: ManagedVacancy = {
      id: 'v1',
      employer_id: 'e1',
      application_count: 0,
      new_application_count: 0,
      title: 'Cook',
      description: null,
      employment_type: 'contract',
      work_arrangement: 'remote',
      district_id: null,
      min_qualification_level_id: null,
      min_experience_years: 3,
      salary_min: 500000,
      salary_max: null,
      show_salary: true,
      application_method: 'external',
      external_url: 'https://x.example.com',
      status: 'published',
      published_at: '2026-11-01T09:00:00Z',
      expires_at: '2026-12-01T20:59:00Z',
      is_live: true,
      created_by_admin: false,
      requirements: [
        { id: 'r1', kind: 'skill', skill_id: 's1', label: 'Python', is_mandatory: true },
        { id: 'r2', kind: 'other', skill_id: null, label: 'Own motorbike', is_mandatory: false },
      ],
      created_at: '2026-11-01T09:00:00Z',
      updated_at: '2026-11-01T09:00:00Z',
    }

    expect(fromVacancy(vacancy)).toEqual({
      title: 'Cook',
      description: '',
      employment_type: 'contract',
      work_arrangement: 'remote',
      district_id: '',
      min_qualification_level_id: '',
      min_experience_years: '3',
      salary_min: '500000',
      salary_max: '',
      show_salary: true,
      application_method: 'external',
      external_url: 'https://x.example.com',
      closing_date: '2026-12-01',
      skills: [{ id: 's1', name: 'Python', is_mandatory: true }],
      others: [{ kind: 'other', label: 'Own motorbike', is_mandatory: false }],
    })
  })

  it('maps server field names onto form fields', () => {
    expect(formFieldForServerKey('expires_at')).toBe('closing_date')
    expect(formFieldForServerKey('requirements.2.skill_id')).toBe('requirements')
    expect(formFieldForServerKey('requirements')).toBe('requirements')
    expect(formFieldForServerKey('title')).toBe('title')
  })
})
