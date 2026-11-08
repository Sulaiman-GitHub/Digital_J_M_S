import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { loginUser } from '../../api/auth'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { PasswordField } from '../../components/PasswordField'
import { TextField } from '../../components/TextField'
import { safeNextPath } from '../../lib/safeRedirect'
import { AuthShell, TextLink } from './AuthShell'
import { loginSchema, type LoginValues } from './schemas'
import { ME_KEY } from './useCurrentUser'
import { useServerErrors } from './useServerErrors'

const FIELDS = ['email', 'password'] as const

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
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
      navigate(safeNextPath(params.get('next')) ?? '/account', { replace: true })
    },
    onError: handleError,
  })

  return (
    <AuthShell title="Log in" lead="Welcome back.">
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
        <p className="text-center text-sm text-text-secondary">
          New here? <TextLink to="/register">Create an account</TextLink>
        </p>
      </form>
    </AuthShell>
  )
}
