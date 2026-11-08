import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { forgotPassword } from '../../api/auth'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { AuthShell, TextLink } from './AuthShell'
import { CheckEmailNotice } from './CheckEmailNotice'
import { forgotPasswordSchema, type ForgotPasswordValues } from './schemas'
import { useServerErrors } from './useServerErrors'

const FIELDS = ['email'] as const

export function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const { formError, clearFormError, handleError } = useServerErrors(setError, FIELDS)
  const [sent, setSent] = useState(false)

  const mutation = useMutation({
    mutationFn: ({ email }: ForgotPasswordValues) => forgotPassword(email),
    onSuccess: () => setSent(true),
    onError: handleError,
  })

  if (sent) {
    // Same words whether or not the account exists: the server never says.
    return (
      <CheckEmailNotice hint="The link works for 60 minutes. No email? Check your spam folder.">
        If an account exists for this email, we sent a link to choose a new password.
      </CheckEmailNotice>
    )
  }

  return (
    <AuthShell
      title="Forgot your password?"
      lead="Enter your email and we will send you a link to choose a new one."
    >
      <form
        noValidate
        onSubmit={handleSubmit((values) => {
          clearFormError()
          mutation.mutate(values)
        })}
        className="space-y-4"
      >
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" fullWidth loading={mutation.isPending}>
          Send reset link
        </Button>
        <p className="text-center text-sm">
          <TextLink to="/login">Back to log in</TextLink>
        </p>
      </form>
    </AuthShell>
  )
}
