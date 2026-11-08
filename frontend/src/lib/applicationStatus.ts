// Application statuses. API values are snake_case; labels are what users see.
export const APPLICATION_STATUSES = [
  'submitted',
  'under_review',
  'shortlisted',
  'interview',
  'offered',
  'rejected',
  'withdrawn',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
}
