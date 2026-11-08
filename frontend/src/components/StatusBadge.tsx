import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '../lib/applicationStatus'
import { Badge, type BadgeTone } from './Badge'

// Colour is always paired with the text label.
const statusTones: Record<ApplicationStatus, BadgeTone> = {
  submitted: 'neutral',
  under_review: 'info',
  shortlisted: 'teal',
  interview: 'warning',
  offered: 'success',
  rejected: 'danger',
  withdrawn: 'outline',
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={statusTones[status]}>{APPLICATION_STATUS_LABELS[status]}</Badge>
}
