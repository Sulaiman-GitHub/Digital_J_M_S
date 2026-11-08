import type { EmploymentType, WorkArrangement } from '../../api/types'

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  temporary: 'Temporary',
}

export const ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  onsite: 'On-site',
  remote: 'Remote',
  hybrid: 'Hybrid',
}

const number = new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 })

/** "UGX 1,200,000 – 1,500,000", "UGX 900,000", "From UGX …", "Up to UGX …", or null if none. */
export function formatSalary(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null
  if (min !== null && max !== null) {
    return min === max
      ? `UGX ${number.format(min)}`
      : `UGX ${number.format(min)} – ${number.format(max)}`
  }
  if (min !== null) return `From UGX ${number.format(min)}`
  return `Up to UGX ${number.format(max as number)}`
}

/** Where the job is: the district, or "Remote". */
export function placeLabel(districtName: string | null, arrangement: WorkArrangement): string {
  if (arrangement === 'remote') return districtName ? `Remote · ${districtName}` : 'Remote'
  return districtName ?? ARRANGEMENT_LABELS[arrangement]
}

export function experienceLabel(years: number): string {
  if (years === 0) return 'None required'
  return years === 1 ? '1 year' : `${years} years`
}

/** The host of a link, for "Opens example.com in a new tab". Falls back to a generic phrase. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'the employer site'
  }
}
