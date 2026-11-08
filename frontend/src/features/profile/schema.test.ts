import { describe, expect, it } from 'vitest'
import { addYears, todayInKampala } from '../../lib/dates'
import {
  OTHER,
  createProfileSchema,
  emptyExperience,
  emptyValues,
  firstUnfinishedStep,
  formFieldForServerKey,
  fromProfile,
  isUgandanMobile,
  savedPercent,
  stepOfField,
  toPayload,
  type ProfileFormValues,
} from './schema'
import { BACHELORS, EXCEL, GULU, GULU_UNIVERSITY, PYTHON, makeProfile } from './testData'

const TODAY = '2026-11-05'
const schema = createProfileSchema(TODAY)

function valid(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
  return {
    ...emptyValues(),
    full_name: 'Nakato Sarah',
    district_id: GULU,
    institution_id: GULU_UNIVERSITY,
    qualification_level_id: BACHELORS,
    ...overrides,
  }
}

/** The problems found, keyed by field path ("experiences.0.title"). */
function problems(values: ProfileFormValues): Record<string, string> {
  const result = schema.safeParse(values)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('profile rules (mirroring the backend)', () => {
  it('accepts a minimal profile', () => {
    expect(problems(valid())).toEqual({})
  })

  it('needs a name of 2 to 150 characters', () => {
    expect(problems(valid({ full_name: ' A ' }))).toHaveProperty('full_name')
    expect(problems(valid({ full_name: '' }))).toHaveProperty('full_name')
    expect(problems(valid({ full_name: 'x'.repeat(151) }))).toHaveProperty('full_name')
    expect(problems(valid({ full_name: '  Nakato   Sarah ' }))).toEqual({})
  })

  it.each(['0772123456', '0772 123 456', '+256 772 123456', '256772123456', '(0772) 123-456'])(
    'accepts the phone number %s',
    (phone) => {
      expect(problems(valid({ phone }))).toEqual({})
      expect(isUgandanMobile(phone)).toBe(true)
    },
  )

  it.each(['12345', '0672123456', '+254772123456', '07721234', '077212345678', 'abc'])(
    'refuses the phone number %s',
    (phone) => {
      expect(problems(valid({ phone }))).toHaveProperty('phone')
    },
  )

  it('lets the phone be empty', () => {
    expect(problems(valid({ phone: '  ' }))).toEqual({})
  })

  it('needs a district, an institution and a qualification', () => {
    const found = problems(
      valid({ district_id: '', institution_id: '', qualification_level_id: '' }),
    )

    expect(Object.keys(found).sort()).toEqual([
      'district_id',
      'institution_id',
      'qualification_level_id',
    ])
  })

  it('needs the institution name when "Other" is chosen', () => {
    expect(problems(valid({ institution_id: OTHER }))).toHaveProperty('institution_other_name')
    expect(
      problems(valid({ institution_id: OTHER, institution_other_name: 'Kabale Hills Institute' })),
    ).toEqual({})
    expect(
      problems(valid({ institution_id: OTHER, institution_other_name: 'x'.repeat(201) })),
    ).toHaveProperty('institution_other_name')
  })

  it('treats the field of study as optional, but needs a name for "Other"', () => {
    expect(problems(valid({ field_of_study_id: '' }))).toEqual({})
    expect(problems(valid({ field_of_study_id: OTHER }))).toHaveProperty('field_of_study_other')
    expect(
      problems(valid({ field_of_study_id: OTHER, field_of_study_other: 'Beekeeping' })),
    ).toEqual({})
  })

  describe('study dates', () => {
    it('refuses a graduation date in the future or before 1970 for a graduate', () => {
      expect(
        problems(valid({ study_status: 'completed', graduation_date: '2026-11-06' })),
      ).toHaveProperty('graduation_date')
      expect(
        problems(valid({ study_status: 'completed', graduation_date: '1960-01-01' })),
      ).toHaveProperty('graduation_date')
      expect(problems(valid({ study_status: 'completed', graduation_date: TODAY }))).toEqual({})
    })

    it('allows an expected completion date up to ten years ahead for a student', () => {
      const studying = { study_status: 'studying' as const }

      expect(
        problems(valid({ ...studying, expected_completion_date: addYears(TODAY, 9) })),
      ).toEqual({})
      expect(
        problems(valid({ ...studying, expected_completion_date: addYears(TODAY, 11) })),
      ).toHaveProperty('expected_completion_date')
    })

    it('ignores the date that does not fit the study status', () => {
      // The form clears it, and the payload never sends it.
      expect(problems(valid({ study_status: 'studying', graduation_date: '2999-01-01' }))).toEqual(
        {},
      )
    })
  })

  it('allows at most 30 skills and 10 experiences', () => {
    const skills = Array.from({ length: 31 }, (_, n) => ({ id: `id-${n}`, name: `Skill ${n}` }))
    const experiences = Array.from({ length: 11 }, () => ({
      ...emptyExperience(),
      title: 'Clerk',
      organisation: 'Gulu Traders',
      start_date: '2024-01-01',
    }))

    expect(problems(valid({ skills }))).toHaveProperty('skills')
    expect(problems(valid({ skills: skills.slice(0, 30) }))).toEqual({})
    expect(problems(valid({ experiences }))).toHaveProperty('experiences')
    expect(problems(valid({ experiences: experiences.slice(0, 10) }))).toEqual({})
  })

  describe('experiences', () => {
    const entry = {
      ...emptyExperience(),
      title: 'Accounts Intern',
      organisation: 'Ssese Fresh Foods Ltd',
      start_date: '2024-01-08',
      end_date: '2024-06-28',
    }

    it('accepts a complete entry and a current job without an end date', () => {
      expect(problems(valid({ experiences: [entry] }))).toEqual({})
      expect(problems(valid({ experiences: [{ ...entry, end_date: '', current: true }] }))).toEqual(
        {},
      )
    })

    it('needs a title, an organisation and a start date, reported on that entry', () => {
      const found = problems(valid({ experiences: [entry, { ...emptyExperience(), title: ' ' }] }))

      expect(Object.keys(found).sort()).toEqual([
        'experiences.1.organisation',
        'experiences.1.start_date',
        'experiences.1.title',
      ])
    })

    it('refuses an end before the start, and future dates', () => {
      expect(
        problems(valid({ experiences: [{ ...entry, end_date: '2023-01-01' }] })),
      ).toHaveProperty('experiences.0.end_date')
      expect(
        problems(valid({ experiences: [{ ...entry, end_date: '2026-12-01' }] })),
      ).toHaveProperty('experiences.0.end_date')
      expect(
        problems(valid({ experiences: [{ ...entry, start_date: '2026-12-01', end_date: '' }] })),
      ).toHaveProperty('experiences.0.start_date')
    })

    it('ignores the end date of a current job', () => {
      const current = { ...entry, current: true, end_date: '2023-01-01' }

      expect(problems(valid({ experiences: [current] }))).toEqual({})
    })

    it('limits the description to 1000 characters', () => {
      expect(
        problems(valid({ experiences: [{ ...entry, description: 'x'.repeat(1001) }] })),
      ).toHaveProperty('experiences.0.description')
    })
  })

  it('limits the summary to 1000 characters', () => {
    expect(problems(valid({ summary: 'x'.repeat(1000) }))).toEqual({})
    expect(problems(valid({ summary: 'x'.repeat(1001) }))).toHaveProperty('summary')
  })

  it('uses the real Kampala date when none is given', () => {
    const realClock = createProfileSchema()

    expect(
      realClock.safeParse(valid({ study_status: 'completed', graduation_date: '2999-01-01' }))
        .success,
    ).toBe(false)
    expect(
      realClock.safeParse(valid({ study_status: 'completed', graduation_date: todayInKampala() }))
        .success,
    ).toBe(true)
    expect(todayInKampala()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('judges "today" in Kampala time, not UTC', () => {
    // 22:30 UTC on 5 Nov is already 01:30 on 6 Nov in Kampala (UTC+3).
    expect(todayInKampala(new Date('2026-11-05T22:30:00Z'))).toBe('2026-11-06')
    expect(todayInKampala(new Date('2026-11-05T20:59:00Z'))).toBe('2026-11-05')
  })
})

describe('toPayload', () => {
  it('sends only what fits: listed institution, the date for the status, ids for skills', () => {
    const payload = toPayload(
      valid({
        full_name: '  Nakato   Sarah ',
        phone: ' 0772 123456 ',
        study_status: 'completed',
        graduation_date: '2025-07-15',
        expected_completion_date: '2027-01-01', // leftover: must not be sent
        skills: [
          { id: PYTHON, name: 'Python' },
          { id: EXCEL, name: 'Microsoft Excel' },
        ],
        summary: '  Hello  ',
      }),
    )

    expect(payload).toMatchObject({
      full_name: 'Nakato   Sarah', // trimmed; the server collapses inner spaces
      phone: '0772 123456',
      institution_id: GULU_UNIVERSITY,
      institution_other_name: null,
      field_of_study_id: null,
      field_of_study_other: null,
      graduation_date: '2025-07-15',
      expected_completion_date: null,
      skill_ids: [PYTHON, EXCEL],
      summary: 'Hello',
      experiences: [],
    })
  })

  it('sends "Other" institutions and fields as typed names, not ids', () => {
    const payload = toPayload(
      valid({
        institution_id: OTHER,
        institution_other_name: ' Kabale Hills Institute ',
        field_of_study_id: OTHER,
        field_of_study_other: ' Beekeeping ',
      }),
    )

    expect(payload).toMatchObject({
      institution_id: null,
      institution_other_name: 'Kabale Hills Institute',
      field_of_study_id: null,
      field_of_study_other: 'Beekeeping',
    })
  })

  it('sends a current job without an end date and empty text as null', () => {
    const payload = toPayload(
      valid({
        study_status: 'studying',
        expected_completion_date: '2027-06-30',
        graduation_date: '',
        phone: '',
        summary: '   ',
        experiences: [
          {
            ...emptyExperience(),
            title: ' Tutor ',
            organisation: 'Gulu High',
            start_date: '2025-02-01',
            end_date: '2025-03-01',
            current: true,
            description: '  ',
          },
        ],
      }),
    )

    expect(payload.expected_completion_date).toBe('2027-06-30')
    expect(payload.graduation_date).toBeNull()
    expect(payload.phone).toBeNull()
    expect(payload.summary).toBeNull()
    expect(payload.experiences).toEqual([
      {
        title: 'Tutor',
        organisation: 'Gulu High',
        start_date: '2025-02-01',
        end_date: null,
        description: null,
      },
    ])
  })
})

describe('fromProfile', () => {
  it('turns a saved profile into form values', () => {
    const values = fromProfile(
      makeProfile({
        skills: [{ id: PYTHON, name: 'Python' }],
        experiences: [
          {
            id: 'e1',
            title: 'Tutor',
            organisation: 'Gulu High',
            start_date: '2025-02-01',
            end_date: null,
            description: null,
          },
        ],
        summary: 'Hello',
      }),
    )

    expect(values).toMatchObject({
      full_name: 'Nakato Sarah',
      phone: '+256772123456',
      institution_id: GULU_UNIVERSITY,
      graduation_date: '2025-07-15',
      expected_completion_date: '',
      summary: 'Hello',
      skills: [{ id: PYTHON, name: 'Python' }],
    })
    expect(values.experiences[0]).toMatchObject({ end_date: '', current: true, description: '' })
  })

  it('shows typed institutions and fields as "Other"', () => {
    const values = fromProfile(
      makeProfile({
        institution_id: null,
        institution_other_name: 'Kabale Hills Institute',
        field_of_study_id: null,
        field_of_study_other: 'Beekeeping',
      }),
    )

    expect(values).toMatchObject({
      institution_id: OTHER,
      institution_other_name: 'Kabale Hills Institute',
      field_of_study_id: OTHER,
      field_of_study_other: 'Beekeeping',
    })
  })

  it('round-trips: saved profile to form values to payload keeps the same data', () => {
    const profile = makeProfile({ summary: 'Hello', skills: [{ id: PYTHON, name: 'Python' }] })

    const payload = toPayload(fromProfile(profile))

    expect(payload).toMatchObject({
      full_name: profile.full_name,
      phone: profile.phone,
      institution_id: profile.institution_id,
      qualification_level_id: profile.qualification_level_id,
      field_of_study_id: profile.field_of_study_id,
      graduation_date: profile.graduation_date,
      district_id: profile.district_id,
      summary: 'Hello',
      skill_ids: [PYTHON],
    })
  })
})

describe('progress and resume', () => {
  it('has no progress before the first save, 40% after, then 20% per later step', () => {
    expect(savedPercent(null)).toBe(0)
    expect(savedPercent(makeProfile())).toBe(40)
    expect(savedPercent(makeProfile({ skills: [{ id: PYTHON, name: 'Python' }] }))).toBe(60)
    expect(
      savedPercent(
        makeProfile({
          skills: [{ id: PYTHON, name: 'Python' }],
          experiences: [
            {
              id: 'e',
              title: 'T',
              organisation: 'O',
              start_date: '2024-01-01',
              end_date: null,
              description: null,
            },
          ],
          summary: 'Hi',
        }),
      ),
    ).toBe(100)
  })

  it('resumes at the first step with nothing saved', () => {
    const skill = { id: PYTHON, name: 'Python' }
    const job = {
      id: 'e',
      title: 'T',
      organisation: 'O',
      start_date: '2024-01-01',
      end_date: null,
      description: null,
    }

    expect(firstUnfinishedStep(null)).toBe('basics')
    expect(firstUnfinishedStep(makeProfile())).toBe('skills')
    expect(firstUnfinishedStep(makeProfile({ skills: [skill] }))).toBe('experience')
    expect(firstUnfinishedStep(makeProfile({ skills: [skill], experiences: [job] }))).toBe(
      'summary',
    )
  })
})

describe('field helpers', () => {
  it('finds the step of a field, including nested experience fields', () => {
    expect(stepOfField('phone')).toBe('basics')
    expect(stepOfField('institution_id')).toBe('education')
    expect(stepOfField('skills')).toBe('skills')
    expect(stepOfField('experiences.2.end_date')).toBe('experience')
    expect(stepOfField('summary')).toBe('summary')
    expect(stepOfField('nonsense')).toBeNull()
  })

  it('names the form field for a server field', () => {
    expect(formFieldForServerKey('skill_ids')).toBe('skills')
    expect(formFieldForServerKey('phone')).toBe('phone')
    expect(formFieldForServerKey('experiences.0.title')).toBe('experiences.0.title')
  })
})
