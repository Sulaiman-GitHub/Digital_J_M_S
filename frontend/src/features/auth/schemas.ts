import { z } from 'zod'

// These mirror the backend rules (schemas/auth.py, core/security.py). The backend stays the
// authority: it also refuses common passwords, which the client cannot know.
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .pipe(z.email('Enter a valid email address, like name@example.com'))

const newPassword = z
  .string()
  .min(1, 'Choose a password')
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)

export const registerSchema = z.object({
  email,
  password: newPassword,
  role: z.enum(['job_seeker', 'employer'], { error: 'Choose how you will use the site' }),
  accept_terms: z.boolean().refine((value) => value, {
    error: 'Agree to the Terms and the Privacy Policy to create an account',
  }),
})
export type RegisterValues = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({ new_password: newPassword })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
