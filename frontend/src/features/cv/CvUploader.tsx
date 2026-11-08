import { useRef, useState, type ChangeEvent } from 'react'
import { CV_DOWNLOAD_URL } from '../../api/cv'
import { ApiError } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { buttonClasses } from '../../components/buttonStyles'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Skeleton } from '../../components/Skeleton'
import { useToast } from '../../components/toastContext'
import { formatDate } from '../../lib/dates'
import { CV_ACCEPT, CV_MAX_BYTES, checkCvFile, formatFileSize, uploadErrorMessage } from './cvRules'
import { useCv, useDeleteCv, useUploadCv } from './useCvData'

/** Choose, replace, download and delete the job seeker's one CV. */
export function CvUploader() {
  const cv = useCv()
  const upload = useUploadCv()
  const remove = useDeleteCv()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const [percent, setPercent] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const uploading = upload.isPending

  function choose() {
    setProblem(null)
    inputRef.current?.click()
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // so choosing the same file again still fires
    if (!file) return
    const message = checkCvFile(file)
    if (message) {
      setProblem(message)
      return
    }
    setProblem(null)
    setPercent(0)
    const controller = new AbortController()
    controllerRef.current = controller
    upload.mutate(
      { file, onProgress: setPercent, signal: controller.signal },
      {
        onSuccess: () => toast.show({ message: 'Your CV is saved.', tone: 'success' }),
        onError: (error) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setProblem(uploadErrorMessage(error))
        },
        onSettled: () => {
          controllerRef.current = null
        },
      },
    )
  }

  function confirmDelete() {
    remove.mutate(undefined, {
      onSuccess: () => {
        setConfirmingDelete(false)
        toast.show({ message: 'Your CV was deleted.', tone: 'success' })
      },
      onError: (error) => {
        setConfirmingDelete(false)
        // Already gone (deleted in another tab): the screen should just show that.
        if (error instanceof ApiError && error.status === 404) {
          void cv.refetch()
          return
        }
        setProblem(error instanceof ApiError ? error.message : 'Could not delete your CV.')
      },
    })
  }

  if (cv.isPending) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading your CV</span>
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (cv.isError) {
    return (
      <ErrorState
        title="Could not load your CV"
        message="We could not reach the server. Check your connection and try again."
        retrying={cv.isFetching}
        onRetry={() => void cv.refetch()}
      />
    )
  }

  const current = cv.data

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={CV_ACCEPT}
        onChange={onFileChosen}
        className="sr-only"
        tabIndex={-1}
        aria-label="CV file"
      />

      {problem && <Alert>{problem}</Alert>}

      {uploading ? (
        <Card aria-live="polite">
          <p className="font-semibold">Uploading your CV…</p>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="my-3 h-2 overflow-hidden rounded-pill bg-border"
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-text-secondary">{percent}%</span>
            <Button variant="ghost" onClick={() => controllerRef.current?.abort()}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : current ? (
        <Card>
          <p className="font-semibold break-words">{current.original_filename}</p>
          <p className="text-sm text-text-secondary">
            {formatFileSize(current.size_bytes)} · Uploaded {formatDate(current.created_at)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={CV_DOWNLOAD_URL} className={buttonClasses({ variant: 'secondary' })}>
              Download
            </a>
            <Button variant="secondary" onClick={choose}>
              Replace
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No CV yet"
          description={`Upload a PDF or Word file, up to ${formatFileSize(CV_MAX_BYTES)}. Employers you apply to will see it.`}
          action={<Button onClick={choose}>Choose a file</Button>}
        />
      )}

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete your CV?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={remove.isPending}>
              Delete CV
            </Button>
          </>
        }
      >
        <p>Your file will be removed. You can upload a new one at any time.</p>
      </Modal>
    </div>
  )
}
