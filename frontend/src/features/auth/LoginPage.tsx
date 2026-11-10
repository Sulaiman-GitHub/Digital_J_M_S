import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { loginUser } from '../../api/auth'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { PasswordField } from '../../components/PasswordField'
import { TextField } from '../../components/TextField'
import type { UserRole } from '../../api/types'
import { cn } from '../../lib/cn'
import { HOME_PATH } from '../../lib/roles'
import { safeNextPath } from '../../lib/safeRedirect'
import { AuthShell, TextLink } from './AuthShell'
import { loginSchema, type LoginValues } from './schemas'
import { ME_KEY } from './useCurrentUser'
import { useServerErrors } from './useServerErrors'

const FIELDS = ['email', 'password'] as const

// Everyone logs in through the same form and the server decides the real role. The choice only
// tailors the wording, so people find "their" door the way they would on a portal.
const PORTALS: { role: UserRole; label: string; lead: string }[] = [
  { role: 'job_seeker', label: 'Job seeker', lead: 'Welcome back. Pick up your applications.' },
  { role: 'employer', label: 'Employer', lead: 'Manage your vacancies and applicants.' },
  { role: 'admin', label: 'Admin', lead: 'Review employers and reported vacancies.' },
]

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const requested = params.get('as')
  const portal = PORTALS.find((item) => item.role === requested) ?? PORTALS[0]
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const { formError, clearFormError, handleError } = useServerErrors(setError, FIELDS)

  const mutation = useMutation({
    mutationFn: loginUser,
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user)
      // Back to the page that asked for login, but only if it is a path on this site.
      navigate(safeNextPath(params.get('next')) ?? HOME_PATH[user.role], { replace: true })
    },
    onError: handleError,
  })

  return (
    <AuthShell title="Log in" lead={portal.lead}>
      <form
        noValidate
        onSubmit={handleSubmit((values) => {
          clearFormError()
          mutation.mutate(values)
        })}
        className="space-y-4"
      >
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">I am logging in as</legend>
          <div className="grid grid-cols-3 gap-2">
            {PORTALS.map((item) => (
              <label
                key={item.role}
                className={cn(
                  'relative flex min-h-11 cursor-pointer items-center justify-center rounded-card border border-text-secondary px-2 text-center text-sm font-semibold',
                  'has-checked:border-2 has-checked:border-primary has-checked:bg-primary-tint has-checked:text-primary',
                  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
                )}
              >
                <input
                  type="radio"
                  name="portal"
                  value={item.role}
                  checked={portal.role === item.role}
                  onChange={() => {
                    const next = new URLSearchParams(params)
                    next.set('as', item.role)
                    setParams(next, { replace: true })
                  }}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        {formError && <Alert>{formError}</Alert>}
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
          autoComplete="current-password"
          error={errors.password?.message}
          labelAction={
            <Link
              to="/forgot-password"
              className="rounded text-sm font-semibold text-primary underline"
            >
              Forgot password?
            </Link>
          }
          {...register('password')}
        />
        <Button type="submit" fullWidth loading={mutation.isPending}>
          Log in
        </Button>
        {portal.role === 'admin' ? (
          <p className="text-center text-sm text-text-secondary">
            Administrator accounts are created by the system owner, not by registering.
          </p>
        ) : (
          <p className="text-center text-sm text-text-secondary">
            New here? <TextLink to="/register">Create an account</TextLink>
          </p>
        )}
      </form>
    </AuthShell>
  )
}
