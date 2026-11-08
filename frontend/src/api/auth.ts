import { apiGet, apiPost } from './client'
import type { DataResponse, MessageData, User } from './types'

const AUTH = '/api/v1/auth'

export interface RegisterInput {
  email: string
  password: string
  role: 'job_seeker' | 'employer'
  /** Must be true: the person agrees to the Terms and the Privacy Policy. */
  accept_terms: boolean
}

export interface LoginInput {
  email: string
  password: string
}

export async function fetchMe(signal?: AbortSignal): Promise<User> {
  return (await apiGet<DataResponse<User>>(`${AUTH}/me`, { signal })).data
}

export async function registerUser(input: RegisterInput): Promise<User> {
  return (await apiPost<DataResponse<User>>(`${AUTH}/register`, input)).data
}

export async function loginUser(input: LoginInput): Promise<User> {
  return (await apiPost<DataResponse<User>>(`${AUTH}/login`, input)).data
}

export async function logoutUser(): Promise<void> {
  await apiPost<null>(`${AUTH}/logout`)
}

export async function verifyEmail(token: string): Promise<User> {
  return (await apiPost<DataResponse<User>>(`${AUTH}/verify-email`, { token })).data
}

export async function resendVerification(): Promise<MessageData> {
  return (await apiPost<DataResponse<MessageData>>(`${AUTH}/resend-verification`)).data
}

export async function forgotPassword(email: string): Promise<MessageData> {
  return (await apiPost<DataResponse<MessageData>>(`${AUTH}/forgot-password`, { email })).data
}

export async function resetPassword(token: string, newPassword: string): Promise<MessageData> {
  return (
    await apiPost<DataResponse<MessageData>>(`${AUTH}/reset-password`, {
      token,
      new_password: newPassword,
    })
  ).data
}
