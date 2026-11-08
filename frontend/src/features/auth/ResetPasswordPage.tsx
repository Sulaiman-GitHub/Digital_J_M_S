import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../../api/auth'
import { ApiError } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { buttonClasses } from '../../components/buttonStyles'
import { PasswordField } from '../../components/PasswordField'
import { AuthShell, TextLink } from './AuthShell'
import { resetPasswordSchema, type ResetPasswordValues } from './schemas'
import { useServerErrors } from './useServerErrors'

const FIELDS = ['new_password'] as const
const TOKEN_ERRORS = new Set(['token_invalid', 'token_expired', 'token_used'])

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: '' },
  })
  const { formError, clearFormError, handleError } = useServerErrors(setError, FIELDS)
  const [linkProblem, setLinkProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const mutation = useMutation({
    mutationFn: ({ new_password }: ResetPasswordValues) => resetPassword(token ?? '', new_password),
    onSuccess: () => setDone(true),
    onError: (error) => {
      if (error instanceof ApiError && TOKEN_ERRORS.has(error.code)) {
        setLinkProblem(error.message)
        return
      }
      handleError(error)
    },
  })

  if (done) {
    return (
      <AuthShell title="Password changed" centered>
        <Alert tone="success">Log in with your new password.</Alert>
        <Link to="/login" className={buttonClasses({ fullWidth: true })}>
          Log in
        </Link>
      </AuthShell>
    )
  }

  if (!token || linkProblem) {
    return (
      <AuthShell title="This link cannot be used" centered>
        <p className="text-text-secondary">
          {linkProblem ?? 'This link is not valid. Request a new one.'}
        </p>
        <Link to="/forgot-password" className={buttonClasses({ fullWidth: true })}>
          Request a new link
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password" lead="This logs you out on all your devices.">
      <form
        noValidate
        onSubmit={handleSubmit((values) => {
          clearFormError()
          mutation.mutate(values)
        })}
        className="space-y-4"
      >
        {formError && <Alert>{formError}</Alert>}
        <PasswordField
          label="New password"
          hint="At least 8 characters. Avoid common passwords."
          autoComplete="new-password"
          error={errors.new_password?.message}
          {...register('new_password')}
        />
        <Button type="submit" fullWidth loading={mutation.isPending}>
          Save new password
        </Button>
        <p className="text-center text-sm">
          <TextLink to="/login">Back to log in</TextLink>
        </p>
      </form>
    </AuthShell>
  )
}
