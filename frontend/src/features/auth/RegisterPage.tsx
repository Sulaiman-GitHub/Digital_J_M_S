import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { registerUser } from '../../api/auth'
import { ApiError } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Checkbox } from '../../components/Checkbox'
import { FormError } from '../../components/FormError'
import { PasswordField } from '../../components/PasswordField'
import { TextField } from '../../components/TextField'
import { AuthShell, TextLink } from './AuthShell'
import { CheckEmailNotice } from './CheckEmailNotice'
import { registerSchema, type RegisterValues } from './schemas'
import { useServerErrors } from './useServerErrors'

const FIELDS = ['email', 'password', 'role', 'accept_terms'] as const

const ROLE_OPTIONS = [
  { value: 'job_seeker', title: 'Looking for work', hint: 'Student or graduate' },
  { value: 'employer', title: 'Hiring', hint: 'Employer' },
] as const

export function RegisterPage() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', role: 'job_seeker', accept_terms: false },
  })
  const { formError, clearFormError, handleError } = useServerErrors(setError, FIELDS)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: registerUser,
    onSuccess: (user) => setRegisteredEmail(user.email),
    onError: (error) => {
      // A plain 409 (no field details): show it where the user can fix it, under the email.
      if (error instanceof ApiError && error.code === 'email_taken') {
        setError('email', { type: 'server', message: error.message })
        return
      }
      handleError(error)
    },
  })

  if (registeredEmail) {
    return (
      <CheckEmailNotice>
        We sent a link to <strong className="text-text">{registeredEmail}</strong>. Open it to
        confirm your address. The link works for 24 hours.
      </CheckEmailNotice>
    )
  }

  return (
    <AuthShell title="Create your account" lead="Free for students, graduates and employers.">
      <form
        noValidate
        onSubmit={handleSubmit((values) => {
          clearFormError()
          mutation.mutate(values)
        })}
        className="space-y-4"
      >
        {formError && <Alert>{formError}</Alert>}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">I am</legend>
          <div className="grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-card border border-text-secondary p-3 has-checked:border-2 has-checked:border-primary has-checked:bg-primary-tint"
              >
                <input
                  type="radio"
                  value={option.value}
                  className="mt-1 size-4.5 accent-primary"
                  aria-describedby={errors.role ? 'role-error' : undefined}
                  {...register('role')}
                />
                <span>
                  <span className="block font-semibold">{option.title}</span>
                  <span className="text-sm text-text-secondary">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.role && <FormError id="role-error">{errors.role.message}</FormError>}
        </fieldset>

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Password"
          hint="At least 8 characters. Avoid common passwords."
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Checkbox
          label={
            <>
              I agree to the{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="underline">
                Terms of Use
              </Link>{' '}
              and the{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                Privacy Policy
              </Link>
            </>
          }
          error={errors.accept_terms?.message}
          {...register('accept_terms')}
        />

        <Button type="submit" fullWidth loading={mutation.isPending}>
          Create account
        </Button>
        <p className="text-center text-sm text-text-secondary">
          Already have an account? <TextLink to="/login">Log in</TextLink>
        </p>
      </form>
    </AuthShell>
  )
}
