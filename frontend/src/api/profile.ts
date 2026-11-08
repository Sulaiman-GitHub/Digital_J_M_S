import { apiGet, apiPut } from './client'
import { ApiError, type DataResponse, type Profile, type ProfileInput } from './types'

const PROFILE = '/api/v1/profile/me'

/** The caller's profile, or null if they have not created one yet (404 profile_not_found). */
export async function fetchProfile(signal?: AbortSignal): Promise<Profile | null> {
  try {
    return (await apiGet<DataResponse<Profile>>(PROFILE, { signal })).data
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Create the profile, or replace it entirely (skills and experiences included). */
export async function saveProfile(input: ProfileInput): Promise<Profile> {
  return (await apiPut<DataResponse<Profile>>(PROFILE, input)).data
}
