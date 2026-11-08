import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteMyAccount, exportMyData } from '../../api/account'
import { ApiError } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Modal } from '../../components/Modal'
import { TextField } from '../../components/TextField'
import { useToast } from '../../components/toastContext'
import { useAuth } from '../auth/authContext'

function deleteMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'wrong_password') return 'That password is not correct.'
    if (error.code === 'live_vacancies') {
      return 'You still have live vacancies. Close them first, then delete your account.'
    }
    if (error.status === 429) return 'Too many tries. Please wait a minute and try again.'
    return error.message
  }
  return 'We could not delete your account. Please try again.'
}

/** Download your data, and delete your account. */
export function YourData() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [exporting, setExporting] = useState(false)
  const [exportProblem, setExportProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const isSeeker = user?.role === 'job_seeker'

  async function download() {
    setExporting(true)
    setExportProblem(null)
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'my-data.json'
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportProblem('We could not prepare your data. Check your connection and try again.')
    } finally {
      setExporting(false)
    }
  }

  async function confirmDelete() {
    if (!password) {
      setProblem('Enter your password to confirm.')
      return
    }
    setDeleting(true)
    setProblem(null)
    try {
      await deleteMyAccount(password)
    } catch (error) {
      setProblem(deleteMessage(error))
      setDeleting(false)
      return
    }
    // The server has ended the session. ForgetDeletedSession clears the user once the home page
    // is showing (clearing it here would send the person to the login page first).
    toast.show({ message: 'Your account was deleted.', tone: 'success' })
    navigate('/', { replace: true, state: { accountDeleted: true } })
  }

  function close() {
    setConfirming(false)
    setPassword('')
    setProblem(null)
  }

  return (
    <section aria-labelledby="your-data-title" className="max-w-md space-y-3">
      <h2 id="your-data-title" className="text-title-sm font-semibold">
        Your data
      </h2>

      <Card className="space-y-2">
        <h3 className="font-semibold">Download my data</h3>
        <p className="text-text-secondary">
          A file with everything we hold about you
          {isSeeker ? ': your account, profile, consents and applications' : ''}.
          {isSeeker && ' Your CV is not inside it; download it from your profile.'}
        </p>
        {exportProblem && <Alert tone="danger">{exportProblem}</Alert>}
        <Button variant="secondary" loading={exporting} onClick={() => void download()}>
          Download my data
        </Button>
      </Card>

      <Card className="space-y-2 border-danger">
        <h3 className="font-semibold text-danger">Delete account</h3>
        <p className="text-text-secondary">
          This cannot be undone.
          {isSeeker
            ? ' Your profile, CV and cover notes are erased. Employers you applied to keep your applications and their history, shown as “Deleted user”.'
            : ' Your company details are erased and your vacancies are closed. You must close live vacancies first.'}
        </p>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Delete my account…
        </Button>
      </Card>

      <Modal
        open={confirming}
        onClose={close}
        title="Delete your account?"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Keep my account
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
              Delete my account
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-text-secondary">
            This cannot be undone. You will be logged out at once and cannot log in again.
          </p>
          {problem && <Alert tone="danger">{problem}</Alert>}
          <TextField
            label="Your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </Modal>
    </section>
  )
}
