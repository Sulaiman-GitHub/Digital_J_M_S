import type { ManagedVacancy } from '../../../api/types'
import type { BadgeTone } from '../../../components/Badge'

export interface VacancyBadge {
  label: string
  tone: BadgeTone
}

/** What to call a vacancy: Draft, Live, Expired (published but past its date) or Closed. */
export function vacancyBadge(vacancy: Pick<ManagedVacancy, 'status' | 'is_live'>): VacancyBadge {
  if (vacancy.status === 'draft') return { label: 'Draft', tone: 'neutral' }
  if (vacancy.status === 'closed') return { label: 'Closed', tone: 'neutral' }
  return vacancy.is_live
    ? { label: 'Live', tone: 'success' }
    : { label: 'Expired', tone: 'warning' }
}
