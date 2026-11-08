import type { BadgeTone } from '../../components/Badge'
import type { VerificationStatus } from '../../api/types'

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  draft: 'Not sent yet',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
}

export const STATUS_TONES: Record<VerificationStatus, BadgeTone> = {
  draft: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  suspended: 'danger',
}

/** While a review is under way, or after suspension, the employer cannot edit the profile. */
export function isLocked(status: VerificationStatus | null): boolean {
  return status === 'pending' || status === 'suspended'
}

/** Why publishing is not available, in words, for each status that blocks it. */
export function publishBlockedReason(status: VerificationStatus | null): string {
  switch (status) {
    case 'pending':
      return 'Available once we have finished checking your company.'
    case 'rejected':
      return 'Your company was not approved. Fix the points and send it again.'
    case 'suspended':
      return 'Publishing is blocked while your company is suspended.'
    default:
      return 'Available once your company is verified.'
  }
}
