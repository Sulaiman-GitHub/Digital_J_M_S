import { useState } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { TextArea } from '../../components/TextArea'

export const REASON_MAX = 1000

export interface ReasonDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busy: boolean
  /** A message from the server about the reason, shown under the box. */
  serverError?: string | null
  onConfirm: (reason: string) => void
  onClose: () => void
}

/** Asks for the reason that rejecting or suspending needs. The employer will see it. */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  serverError,
  onConfirm,
  onClose,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  // Start empty each time the dialog opens (state is reset while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setReason('')
      setTouched(false)
    }
  }

  const trimmed = reason.trim()
  const problem =
    touched && trimmed === ''
      ? 'Give a reason. The employer will see it.'
      : trimmed.length > REASON_MAX
        ? `Use at most ${REASON_MAX} characters.`
        : (serverError ?? undefined)

  function confirm() {
    setTouched(true)
    if (trimmed === '' || trimmed.length > REASON_MAX) return
    onConfirm(trimmed)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-text-secondary">{description}</p>
      <TextArea
        label="Reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        onBlur={() => setTouched(true)}
        error={problem}
        required
      />
    </Modal>
  )
}
