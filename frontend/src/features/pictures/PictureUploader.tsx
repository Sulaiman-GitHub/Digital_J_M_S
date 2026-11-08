import { useRef, useState, type ChangeEvent } from 'react'
import { pictureUrl, type PictureKind } from '../../api/pictures'
import { ApiError } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { CompanyAvatar } from '../../components/CompanyAvatar'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { useToast } from '../../components/toastContext'
import {
  PICTURE_ACCEPT,
  PICTURE_MAX_BYTES,
  checkPictureFile,
  pictureErrorMessage,
} from './pictureRules'
import { useDeletePicture, usePicture, useUploadPicture } from './usePicture'

const COPY = {
  photo: {
    noun: 'photo',
    fileLabel: 'Profile photo file',
    hint: 'Employers you apply to will see it with your application.',
  },
  logo: {
    noun: 'logo',
    fileLabel: 'Company logo file',
    hint: 'It shows next to your vacancies for everyone to see.',
  },
} as const

/** Choose, replace and remove a profile photo (job seekers) or a company logo (employers). */
export function PictureUploader({ kind, name }: { kind: PictureKind; name: string }) {
  const copy = COPY[kind]
  const picture = usePicture(kind)
  const upload = useUploadPicture(kind)
  const remove = useDeletePicture(kind)
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string | null>(null)

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // so choosing the same file again still fires
    if (!file) return
    const message = checkPictureFile(file)
    if (message) {
      setProblem(message)
      return
    }
    setProblem(null)
    upload.mutate(file, {
      onSuccess: () => toast.show({ message: `Your ${copy.noun} is saved.`, tone: 'success' }),
      onError: (error) => setProblem(pictureErrorMessage(error)),
    })
  }

  function onRemove() {
    setProblem(null)
    remove.mutate(undefined, {
      onSuccess: () => toast.show({ message: `Your ${copy.noun} was removed.`, tone: 'success' }),
      onError: (error) => {
        // Already gone (removed in another tab): the screen should just show that.
        if (error instanceof ApiError && error.status === 404) {
          void picture.refetch()
          return
        }
        setProblem(pictureErrorMessage(error))
      },
    })
  }

  if (picture.isPending) {
    return (
      <div role="status" className="flex items-center gap-4">
        <span className="sr-only">{`Loading your ${copy.noun}`}</span>
        <Skeleton className="size-20 rounded-pill" />
        <Skeleton className="h-10 w-40" />
      </div>
    )
  }

  if (picture.isError) {
    return (
      <ErrorState
        title={`Could not load your ${copy.noun}`}
        message="We could not reach the server. Check your connection and try again."
        retrying={picture.isFetching}
        onRetry={() => void picture.refetch()}
      />
    )
  }

  const current = picture.data
  const busy = upload.isPending || remove.isPending

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={PICTURE_ACCEPT}
        onChange={onFileChosen}
        className="sr-only"
        tabIndex={-1}
        aria-label={copy.fileLabel}
      />
      {problem && <Alert>{problem}</Alert>}
      <div className="flex flex-wrap items-center gap-4">
        <CompanyAvatar
          name={name}
          size="lg"
          round={kind === 'photo'}
          className="size-20 text-2xl"
          imageUrl={current ? pictureUrl(kind, current.created_at) : null}
        />
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">
            {current
              ? `Your ${copy.noun} is set. ${copy.hint}`
              : `No ${copy.noun} yet. JPEG, PNG or WebP, up to ${PICTURE_MAX_BYTES / (1024 * 1024)} MB. ${copy.hint}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={upload.isPending}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {current ? `Replace ${copy.noun}` : `Choose a ${copy.noun}`}
            </Button>
            {current && (
              <Button variant="ghost" loading={remove.isPending} disabled={busy} onClick={onRemove}>
                {`Remove ${copy.noun}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
