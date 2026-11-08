import { z } from 'zod'
import type { Employer, EmployerInput } from '../../api/types'

// These mirror the server (schemas/employer.py). The server stays the authority.
export const COMPANY_NAME_MAX = 200
export const REGISTRATION_NUMBER_MAX = 50
export const WEBSITE_MAX = 300
export const DESCRIPTION_MAX = 2000

const PHONE_FORM = /^(?:\+?256|0)[347]\d{8}$/

export function isUgandanPhone(value: string): boolean {
  return PHONE_FORM.test(value.replace(/[\s\-().]/g, ''))
}

export function isWebAddress(value: string): boolean {
  if (/\s/.test(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== ''
  } catch {
    return false
  }
}

export const companySchema = z.object({
  company_name: z
    .string()
    .trim()
    .min(1, 'Enter the company name')
    .min(2, 'The company name must have at least 2 letters')
    .max(COMPANY_NAME_MAX, `Use at most ${COMPANY_NAME_MAX} characters`),
  registration_number: z
    .string()
    .trim()
    .max(REGISTRATION_NUMBER_MAX, `Use at most ${REGISTRATION_NUMBER_MAX} characters`),
  website: z
    .string()
    .trim()
    .max(WEBSITE_MAX, `Use at most ${WEBSITE_MAX} characters`)
    .refine((value) => value === '' || isWebAddress(value), {
      error: 'Enter a website address starting with https:// or http://',
    }),
  contact_phone: z
    .string()
    .trim()
    .refine((value) => value === '' || isUgandanPhone(value), {
      error: 'Enter a Ugandan phone number, like 0772 123456 or 0414 123456',
    }),
  district_id: z.string().min(1, 'Choose a district'),
  description: z.string().trim().max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters`),
})
export type CompanyValues = z.infer<typeof companySchema>

export const emptyCompany: CompanyValues = {
  company_name: '',
  registration_number: '',
  website: '',
  contact_phone: '',
  district_id: '',
  description: '',
}

export function fromEmployer(employer: Employer): CompanyValues {
  return {
    company_name: employer.company_name,
    registration_number: employer.registration_number ?? '',
    website: employer.website ?? '',
    contact_phone: employer.contact_phone ?? '',
    district_id: employer.district_id,
    description: employer.description ?? '',
  }
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())

export function toPayload(values: CompanyValues): EmployerInput {
  return {
    company_name: values.company_name.trim(),
    registration_number: orNull(values.registration_number),
    website: orNull(values.website),
    contact_phone: orNull(values.contact_phone),
    district_id: values.district_id,
    description: orNull(values.description),
  }
}

/** What a saved profile still lacks before it can be sent (mirrors the server's check). */
export function missingForSubmission(employer: Employer): string[] {
  const missing: string[] = []
  if (!employer.registration_number) missing.push('the registration number')
  if (!employer.description) missing.push('a description')
  if (!employer.contact_phone && !employer.website) missing.push('a phone number or a website')
  return missing
}

export const COMPANY_FIELDS = [
  'company_name',
  'registration_number',
  'website',
  'contact_phone',
  'district_id',
  'description',
] as const satisfies readonly (keyof CompanyValues)[]
