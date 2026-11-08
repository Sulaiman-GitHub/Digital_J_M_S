import { z } from 'zod'
import type {
  ApplicationMethod,
  EmploymentType,
  ManagedVacancy,
  RequirementInput,
  RequirementKind,
  VacancyInput,
  WorkArrangement,
} from '../../../api/types'
import { addDays, dayInKampala, todayInKampala } from '../../../lib/dates'

// These mirror the server (schemas/vacancy.py, services/vacancies.py). The server stays the
// authority: it checks everything again.
export const TITLE_MIN = 3
export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 10_000
export const LABEL_MAX = 200
export const MAX_REQUIREMENTS = 20
export const MAX_SALARY = 10_000_000_000

/** The farthest closing date offered: 89 days, so that "end of that day" is always within 90 days. */
export const MAX_DAYS_AHEAD = 89

export type OtherKind = Exclude<RequirementKind, 'skill'>

export interface SkillRequirementValue {
  id: string
  name: string
  is_mandatory: boolean
}

export interface OtherRequirementValue {
  kind: OtherKind
  label: string
  is_mandatory: boolean
}

export interface VacancyFormValues {
  title: string
  description: string
  employment_type: EmploymentType | ''
  work_arrangement: WorkArrangement | ''
  district_id: string
  min_qualification_level_id: string
  min_experience_years: string
  salary_min: string
  salary_max: string
  show_salary: boolean
  application_method: ApplicationMethod
  external_url: string
  closing_date: string
  skills: SkillRequirementValue[]
  others: OtherRequirementValue[]
}

export const emptyVacancy: VacancyFormValues = {
  title: '',
  description: '',
  employment_type: '',
  work_arrangement: '',
  district_id: '',
  min_qualification_level_id: '',
  min_experience_years: '0',
  salary_min: '',
  salary_max: '',
  show_salary: false,
  application_method: 'internal',
  external_url: '',
  closing_date: '',
  skills: [],
  others: [],
}

// ---------- closing dates ----------

/** Closing happens at the end of the chosen day in Kampala (UTC+3, no daylight saving). */
export function toExpiresAt(date: string): string {
  return `${date}T23:59:00+03:00`
}

export function fromExpiresAt(iso: string | null): string {
  return iso ? dayInKampala(iso) : ''
}

export interface ClosingRange {
  min: string
  max: string
}

/** The dates the picker offers: today to 89 days after today (or after the publish date). */
export function closingRange(publishedAt: string | null, now: Date = new Date()): ClosingRange {
  const today = todayInKampala(now)
  const base = publishedAt ? dayInKampala(publishedAt) : today
  return { min: today, max: addDays(base, MAX_DAYS_AHEAD) }
}

// ---------- the rules ----------

const isWholeNumber = (value: string) => /^\d+$/.test(value.trim())
const isHttps = (value: string) => {
  if (/\s/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname !== ''
  } catch {
    return false
  }
}

const money = z
  .string()
  .trim()
  .refine((value) => value === '' || (isWholeNumber(value) && Number(value) <= MAX_SALARY), {
    error: 'Enter a whole number of shillings, like 800000',
  })

const requirementSkill = z.object({ id: z.string(), name: z.string(), is_mandatory: z.boolean() })
const requirementOther = z.object({
  kind: z.enum(['qualification', 'certification', 'other']),
  label: z
    .string()
    .trim()
    .min(1, 'Describe the requirement')
    .max(LABEL_MAX, `Use at most ${LABEL_MAX} characters`),
  is_mandatory: z.boolean(),
})

/** The rules for every save. Only the title is needed for a draft. */
export function createDraftSchema(range: ClosingRange = closingRange(null)) {
  return z
    .object({
      title: z
        .string()
        .trim()
        .min(1, 'Enter the job title')
        .min(TITLE_MIN, `The title must have at least ${TITLE_MIN} letters`)
        .max(TITLE_MAX, `Use at most ${TITLE_MAX} characters`),
      description: z
        .string()
        .trim()
        .max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters`),
      employment_type: z.enum([
        'full_time',
        'part_time',
        'contract',
        'internship',
        'temporary',
        '',
      ]),
      work_arrangement: z.enum(['onsite', 'remote', 'hybrid', '']),
      district_id: z.string(),
      min_qualification_level_id: z.string(),
      min_experience_years: z
        .string()
        .trim()
        .refine((value) => value === '' || (isWholeNumber(value) && Number(value) <= 50), {
          error: 'Enter a whole number from 0 to 50',
        }),
      salary_min: money,
      salary_max: money,
      show_salary: z.boolean(),
      application_method: z.enum(['internal', 'external']),
      external_url: z.string().trim().max(500, 'Use at most 500 characters'),
      closing_date: z
        .string()
        .refine((value) => value === '' || (value >= range.min && value <= range.max), {
          error: 'Choose a date from today to the latest date offered',
        }),
      skills: z.array(requirementSkill),
      others: z.array(requirementOther),
    })
    .superRefine((values, ctx) => {
      const problem = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message })
      const low = values.salary_min.trim()
      const high = values.salary_max.trim()
      if (isWholeNumber(low) && isWholeNumber(high) && Number(high) < Number(low)) {
        problem('salary_max', 'The highest pay cannot be lower than the lowest')
      }
      if (
        values.application_method === 'external' &&
        values.external_url &&
        !isHttps(values.external_url)
      ) {
        problem('external_url', 'Enter a link starting with https://')
      }
      if (values.skills.length + values.others.length > MAX_REQUIREMENTS) {
        problem('requirements', `Add at most ${MAX_REQUIREMENTS} requirements`)
      }
    })
}

/** What a vacancy still needs before it can go live (mirrors the server's publish check). */
export function publishProblems(values: VacancyFormValues): Record<string, string> {
  const problems: Record<string, string> = {}
  if (!values.description.trim()) problems.description = 'Describe the job'
  if (!values.employment_type) problems.employment_type = 'Choose the type of job'
  if (!values.work_arrangement) problems.work_arrangement = 'Choose where the work is done'
  if (values.work_arrangement !== 'remote' && !values.district_id) {
    problems.district_id = 'Choose a district (only remote jobs can leave it out)'
  }
  if (values.application_method === 'external' && !values.external_url.trim()) {
    problems.external_url = 'Give the https:// link where people apply'
  }
  if (!values.closing_date) problems.closing_date = 'Choose when applications close'
  return problems
}

// ---------- values <-> API ----------

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())
const toNumber = (value: string) => (value.trim() === '' ? null : Number(value.trim()))

export function toPayload(values: VacancyFormValues): VacancyInput {
  const requirements: RequirementInput[] = [
    ...values.skills.map((skill): RequirementInput => ({
      kind: 'skill',
      skill_id: skill.id,
      label: null,
      is_mandatory: skill.is_mandatory,
    })),
    ...values.others.map((item): RequirementInput => ({
      kind: item.kind,
      skill_id: null,
      label: item.label.trim(),
      is_mandatory: item.is_mandatory,
    })),
  ]
  const external = values.application_method === 'external'
  return {
    title: values.title.trim(),
    description: orNull(values.description),
    employment_type: values.employment_type || null,
    work_arrangement: values.work_arrangement || null,
    district_id: orNull(values.district_id),
    min_qualification_level_id: orNull(values.min_qualification_level_id),
    min_experience_years: toNumber(values.min_experience_years) ?? 0,
    salary_min: toNumber(values.salary_min),
    salary_max: toNumber(values.salary_max),
    show_salary: values.show_salary,
    application_method: values.application_method,
    external_url: external ? orNull(values.external_url) : null,
    expires_at: values.closing_date ? toExpiresAt(values.closing_date) : null,
    requirements,
  }
}

export function fromVacancy(vacancy: ManagedVacancy): VacancyFormValues {
  return {
    title: vacancy.title,
    description: vacancy.description ?? '',
    employment_type: vacancy.employment_type ?? '',
    work_arrangement: vacancy.work_arrangement ?? '',
    district_id: vacancy.district_id ?? '',
    min_qualification_level_id: vacancy.min_qualification_level_id ?? '',
    min_experience_years: String(vacancy.min_experience_years),
    salary_min: vacancy.salary_min === null ? '' : String(vacancy.salary_min),
    salary_max: vacancy.salary_max === null ? '' : String(vacancy.salary_max),
    show_salary: vacancy.show_salary,
    application_method: vacancy.application_method,
    external_url: vacancy.external_url ?? '',
    closing_date: fromExpiresAt(vacancy.expires_at),
    skills: vacancy.requirements
      .filter((item) => item.kind === 'skill' && item.skill_id)
      .map((item) => ({
        id: item.skill_id as string,
        name: item.label,
        is_mandatory: item.is_mandatory,
      })),
    others: vacancy.requirements
      .filter((item) => item.kind !== 'skill')
      .map((item) => ({
        kind: item.kind as OtherKind,
        label: item.label,
        is_mandatory: item.is_mandatory,
      })),
  }
}

/** The form field a server error key belongs to. */
export function formFieldForServerKey(key: string): string {
  if (key === 'expires_at') return 'closing_date'
  if (key.startsWith('requirements')) return 'requirements'
  return key
}

/** Fields that cannot change once a vacancy is published (the server enforces this too). */
export const LOCKED_WHEN_PUBLISHED = [
  'title',
  'employment_type',
  'work_arrangement',
  'district_id',
  'application_method',
  'external_url',
] as const

export const FORM_SECTIONS = {
  basics: ['title', 'employment_type', 'work_arrangement', 'district_id', 'description'],
  pay: [
    'salary_min',
    'salary_max',
    'show_salary',
    'min_qualification_level_id',
    'min_experience_years',
  ],
  requirements: ['requirements'],
  apply: ['application_method', 'external_url'],
  closing: ['closing_date'],
} as const
