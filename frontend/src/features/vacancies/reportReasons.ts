import type { ReportReason } from '../../api/types'

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'scam_or_fee', label: 'Asks for money or a fee' },
  { value: 'fake_employer', label: 'Fake or unknown employer' },
  { value: 'misleading', label: 'Misleading or false information' },
  { value: 'discriminatory', label: 'Discriminatory' },
  { value: 'other', label: 'Something else' },
]

export const DETAILS_MAX = 2000

export const REASON_LABELS: Record<ReportReason, string> = Object.fromEntries(
  REPORT_REASONS.map((item) => [item.value, item.label]),
) as Record<ReportReason, string>
