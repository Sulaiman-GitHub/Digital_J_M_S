import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resendVerification } from '../api/auth'
import { ApiError } from '../api/types'
import { useAuth } from '../features/auth/authContext'
import { ME_KEY } from '../features/auth/useCurrentUser'
import { Button } from './Button'
import { useToast } from './toastContext'

/** Shown to logged-in users whose email is not verified yet. */
export function VerifyEmailBanner() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const resend = useMutation({
    mutationFn: resendVerification,
    onSuccess: (data) => toast.show({ message: data.message, tone: 'success' }),
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'email_already_verified') {
        // Verified in another tab: refresh the user so this banner goes away.
        void queryClient.invalidateQueries({ queryKey: ME_KEY })
        toast.show({ message: error.message, tone: 'info' })
        return
      }
      toast.show({
        message: error instanceof ApiError ? error.message : 'Could not send the link. Try again.',
        tone: 'error',
      })
    },
  })

  if (!user || user.email_verified) return null

  return (
    <div
      role="region"
      aria-label="Email verification"
      className="border-b border-warning bg-accent-tint"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <p>
          <strong className="text-warning">Verify your email</strong> to apply for jobs. We sent a
          link to {user.email}.
        </p>
        <Button
          variant="secondary"
          className="min-h-9"
          loading={resend.isPending}
          onClick={() => resend.mutate()}
        >
          Resend link
        </Button>
      </div>
    </div>
  )
}
