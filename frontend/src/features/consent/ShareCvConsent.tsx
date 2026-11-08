import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Card } from '../../components/Card'
import { Checkbox } from '../../components/Checkbox'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { useConsents, useSetConsent } from './useConsents'

const TYPE = 'cv_sharing_with_employers'

/** The opt-in to let employers see the CV when the person applies. Needed before applying. */
export function ShareCvConsent() {
  const consents = useConsents()
  const change = useSetConsent()
  const [problem, setProblem] = useState<string | null>(null)

  if (consents.isPending) {
    return (
      <div role="status">
        <span className="sr-only">Loading your choice</span>
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (consents.isError) {
    return (
      <ErrorState
        title="Could not load your choice"
        message="We could not reach the server. Check your connection and try again."
        retrying={consents.isFetching}
        onRetry={() => void consents.refetch()}
      />
    )
  }

  const shared = consents.data.some((item) => item.consent_type === TYPE)

  return (
    <Card className="space-y-2">
      {problem && <Alert>{problem}</Alert>}
      <Checkbox
        label="Employers I apply to may see my profile and CV"
        hint={
          <>
            Needed before you can apply for a job. Only employers you apply to can see them, and you
            can change your mind at any time. See the{' '}
            <Link to="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </>
        }
        checked={shared}
        disabled={change.isPending}
        onChange={(event) => {
          setProblem(null)
          change.mutate(
            { type: TYPE, granted: event.target.checked },
            {
              onError: (error) =>
                setProblem(
                  error instanceof ApiError
                    ? error.message
                    : 'Something went wrong. Please try again.',
                ),
            },
          )
        }}
      />
    </Card>
  )
}
