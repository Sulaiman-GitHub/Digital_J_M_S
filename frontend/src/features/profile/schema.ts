import { z } from 'zod'
import type { Profile, ProfileInput, Skill } from '../../api/types'
import { addYears, todayInKampala } from '../../lib/dates'

// These mirror the backend rules (schemas/profile.py, services/profiles.py). The backend stays the
// authority; this lets the form say what is wrong before anything is sent.
export const MAX_SKILLS = 30
export const MAX_EXPERIENCES = 10
export const SUMMARY_MAX = 1000
export const DESCRIPTION_MAX = 1000
const EARLIEST_DATE = '1970-01-01'
const EXPECTED_COMPLETION_YEARS_AHEAD = 10

/** Value of the institution and field-of-study pickers when the user chooses "Other". */
export const OTHER = '__other__'

// Uganda mobile numbers, in the forms the server accepts (it stores +2567XXXXXXXX).
const PHONE_PATTERN = /^(?:\+?256|0)7\d{8}$/
export function isUgandanMobile(value: string): boolean {
  return PHONE_PATTERN.test(value.replace(/[\s\-().]/g, ''))
}

export const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'education', label: 'Education' },
  { id: 'skills', label: 'Skills' },
  { id: 'experience', label: 'Experience' },
  { id: 'summary', label: 'Summary' },
  { id: 'cv', label: 'CV and consent' },
] as const
export type StepId = (typeof STEPS)[number]['id']

export function isStepId(value: unknown): value is StepId {
  return STEPS.some((step) => step.id === value)
}

const experienceSchema = z.object({
  title: z.string(),
  organisation: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  description: z.string(),
  current: z.boolean(),
})

const fields = {
  full_name: z.string(),
  phone: z.string(),
  district_id: z.string(),
  institution_id: z.string(),
  institution_other_name: z.string(),
  qualification_level_id: z.string(),
  field_of_study_id: z.string(),
  field_of_study_other: z.string(),
  study_status: z.enum(['studying', 'completed']),
  expected_completion_date: z.string(),
  graduation_date: z.string(),
  skills: z.array(z.object({ id: z.string(), name: z.string() })),
  experiences: z.array(experienceSchema),
  summary: z.string(),
}

export type ProfileFormValues = z.infer<z.ZodObject<typeof fields>>
export type ExperienceFormValues = ProfileFormValues['experiences'][number]

/** Which form fields belong to which step: used to validate a step and to find an error's step. */
export const STEP_FIELDS: Record<StepId, readonly string[]> = {
  basics: ['full_name', 'phone', 'district_id'],
  education: [
    'institution_id',
    'institution_other_name',
    'qualification_level_id',
    'field_of_study_id',
    'field_of_study_other',
    'study_status',
    'expected_completion_date',
    'graduation_date',
  ],
  skills: ['skills'],
  experience: ['experiences'],
  summary: ['summary'],
  cv: [], // the CV and consents are saved on their own, not with the profile form
}

export function stepOfField(field: string): StepId | null {
  const root = field.split('.')[0]
  return STEPS.find((step) => STEP_FIELDS[step.id].includes(root))?.id ?? null
}

/** The rules for the whole form. `today` is injectable so tests do not depend on the clock. */
export function createProfileSchema(today: string = todayInKampala()) {
  return z.object(fields).superRefine((v, ctx) => {
    const problem = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })

    // Basics
    const name = v.full_name.trim().replace(/\s+/g, ' ')
    if (name.length < 2) problem(['full_name'], 'Enter your full name (2 or more letters).')
    else if (name.length > 150) problem(['full_name'], 'Your name must be at most 150 characters.')
    if (v.phone.trim() && !isUgandanMobile(v.phone)) {
      problem(['phone'], 'Enter a Ugandan mobile number, like 0772 123456 or +256 772 123456.')
    }
    if (!v.district_id) problem(['district_id'], 'Choose your district.')

    // Education
    if (!v.institution_id) {
      problem(['institution_id'], 'Choose your institution, or choose "Other" and type its name.')
    } else if (v.institution_id === OTHER) {
      const other = v.institution_other_name.trim()
      if (!other) problem(['institution_other_name'], 'Type the name of your institution.')
      else if (other.length > 200) {
        problem(['institution_other_name'], 'The name must be at most 200 characters.')
      }
    }
    if (!v.qualification_level_id) {
      problem(['qualification_level_id'], 'Choose your qualification.')
    }
    if (v.field_of_study_id === OTHER) {
      const other = v.field_of_study_other.trim()
      if (!other) problem(['field_of_study_other'], 'Type your field of study.')
      else if (other.length > 150) {
        problem(['field_of_study_other'], 'The name must be at most 150 characters.')
      }
    }
    if (v.study_status === 'completed' && v.graduation_date) {
      if (v.graduation_date < EARLIEST_DATE) problem(['graduation_date'], 'Enter a valid date.')
      else if (v.graduation_date > today) {
        problem(['graduation_date'], 'The graduation date cannot be in the future.')
      }
    }
    if (v.study_status === 'studying' && v.expected_completion_date) {
      if (v.expected_completion_date < EARLIEST_DATE) {
        problem(['expected_completion_date'], 'Enter a valid date.')
      } else if (v.expected_completion_date > addYears(today, EXPECTED_COMPLETION_YEARS_AHEAD)) {
        problem(['expected_completion_date'], 'The expected completion date is too far ahead.')
      }
    }

    // Skills
    if (v.skills.length > MAX_SKILLS) {
      problem(['skills'], `Choose at most ${MAX_SKILLS} skills.`)
    }

    // Experience
    if (v.experiences.length > MAX_EXPERIENCES) {
      problem(['experiences'], `Add at most ${MAX_EXPERIENCES} experiences.`)
    }
    v.experiences.forEach((entry, index) => {
      const at = (field: string) => ['experiences', index, field]
      if (!entry.title.trim()) problem(at('title'), 'Enter the job title.')
      else if (entry.title.trim().length > 150) problem(at('title'), 'Use at most 150 characters.')
      if (!entry.organisation.trim()) problem(at('organisation'), 'Enter the organisation.')
      else if (entry.organisation.trim().length > 150) {
        problem(at('organisation'), 'Use at most 150 characters.')
      }
      if (!entry.start_date) problem(at('start_date'), 'Enter the start date.')
      else if (entry.start_date < EARLIEST_DATE) problem(at('start_date'), 'Enter a valid date.')
      else if (entry.start_date > today) {
        problem(at('start_date'), 'The start date cannot be in the future.')
      }
      if (!entry.current && entry.end_date) {
        if (entry.start_date && entry.end_date < entry.start_date) {
          problem(at('end_date'), 'The end date cannot be before the start date.')
        } else if (entry.end_date > today) {
          problem(
            at('end_date'),
            'The end date cannot be in the future. Tick "I still work here" instead.',
          )
        }
      }
      if (entry.description.trim().length > DESCRIPTION_MAX) {
        problem(at('description'), `Use at most ${DESCRIPTION_MAX} characters.`)
      }
    })

    // Summary
    if (v.summary.trim().length > SUMMARY_MAX) {
      problem(['summary'], `Use at most ${SUMMARY_MAX} characters.`)
    }
  })
}

export function emptyValues(): ProfileFormValues {
  return {
    full_name: '',
    phone: '',
    district_id: '',
    institution_id: '',
    institution_other_name: '',
    qualification_level_id: '',
    field_of_study_id: '',
    field_of_study_other: '',
    study_status: 'completed',
    expected_completion_date: '',
    graduation_date: '',
    skills: [],
    experiences: [],
    summary: '',
  }
}

export function emptyExperience(): ExperienceFormValues {
  return {
    title: '',
    organisation: '',
    start_date: '',
    end_date: '',
    description: '',
    current: false,
  }
}

/** The saved profile as form values. */
export function fromProfile(profile: Profile): ProfileFormValues {
  return {
    full_name: profile.full_name,
    phone: profile.phone ?? '',
    district_id: profile.district_id,
    institution_id: profile.institution_id ?? (profile.institution_other_name ? OTHER : ''),
    institution_other_name: profile.institution_other_name ?? '',
    qualification_level_id: profile.qualification_level_id,
    field_of_study_id: profile.field_of_study_id ?? (profile.field_of_study_other ? OTHER : ''),
    field_of_study_other: profile.field_of_study_other ?? '',
    study_status: profile.study_status,
    expected_completion_date: profile.expected_completion_date ?? '',
    graduation_date: profile.graduation_date ?? '',
    skills: profile.skills.map(({ id, name }): Skill => ({ id, name })),
    experiences: profile.experiences.map((entry) => ({
      title: entry.title,
      organisation: entry.organisation,
      start_date: entry.start_date,
      end_date: entry.end_date ?? '',
      description: entry.description ?? '',
      current: entry.end_date === null,
    })),
    summary: profile.summary ?? '',
  }
}

/** Form values as the PUT body. Only the date that fits the study status is sent. */
export function toPayload(v: ProfileFormValues): ProfileInput {
  const institutionIsOther = v.institution_id === OTHER
  const fieldIsOther = v.field_of_study_id === OTHER
  return {
    full_name: v.full_name.trim(),
    phone: v.phone.trim() || null,
    institution_id: institutionIsOther ? null : v.institution_id,
    institution_other_name: institutionIsOther ? v.institution_other_name.trim() : null,
    qualification_level_id: v.qualification_level_id,
    field_of_study_id: v.field_of_study_id && !fieldIsOther ? v.field_of_study_id : null,
    field_of_study_other: fieldIsOther ? v.field_of_study_other.trim() || null : null,
    study_status: v.study_status,
    expected_completion_date:
      v.study_status === 'studying' ? v.expected_completion_date || null : null,
    graduation_date: v.study_status === 'completed' ? v.graduation_date || null : null,
    district_id: v.district_id,
    summary: v.summary.trim() || null,
    skill_ids: v.skills.map((skill) => skill.id),
    experiences: v.experiences.map((entry) => ({
      title: entry.title.trim(),
      organisation: entry.organisation.trim(),
      start_date: entry.start_date,
      end_date: entry.current ? null : entry.end_date || null,
      description: entry.description.trim() || null,
    })),
  }
}

/** Saved progress for the stepper: 40% once saved, then 20% each for skills, experience, summary. */
export function savedPercent(profile: Profile | null): number {
  if (!profile) return 0
  return (
    40 +
    (profile.skills.length > 0 ? 20 : 0) +
    (profile.experiences.length > 0 ? 20 : 0) +
    (profile.summary ? 20 : 0)
  )
}

/** Where to resume: the first step that still has nothing saved. */
export function firstUnfinishedStep(profile: Profile | null): StepId {
  if (!profile) return 'basics'
  if (profile.skills.length === 0) return 'skills'
  if (profile.experiences.length === 0) return 'experience'
  return 'summary'
}

/** The form's names for the API's field names in a server error. */
export function formFieldForServerKey(key: string): string {
  return key === 'skill_ids' ? 'skills' : key
}
