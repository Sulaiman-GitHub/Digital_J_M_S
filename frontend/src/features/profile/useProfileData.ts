import { useQueries, useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  fetchDistricts,
  fetchFieldsOfStudy,
  fetchInstitutions,
  fetchQualificationLevels,
  searchSkills,
} from '../../api/reference'
import { fetchProfile, saveProfile } from '../../api/profile'
import type { Profile, ProfileInput } from '../../api/types'

export const PROFILE_KEY = ['profile', 'me'] as const

// Reference lists change rarely and the server sends cache headers: keep them for the session.
const REFERENCE_STALE_MS = 60 * 60 * 1000

export function useProfile(enabled = true) {
  return useQuery<Profile | null>({
    queryKey: PROFILE_KEY,
    queryFn: ({ signal }) => fetchProfile(signal),
    enabled,
    staleTime: 60_000,
  })
}

export function useSaveProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProfileInput) => saveProfile(input),
    onSuccess: (profile) => queryClient.setQueryData(PROFILE_KEY, profile),
  })
}

/** The four dropdown lists the profile form needs, loaded together. */
export function useReferenceLists() {
  const results = useQueries({
    queries: [
      {
        queryKey: ['reference', 'districts'],
        queryFn: ({ signal }) => fetchDistricts(signal),
        staleTime: REFERENCE_STALE_MS,
      },
      {
        queryKey: ['reference', 'qualification-levels'],
        queryFn: ({ signal }) => fetchQualificationLevels(signal),
        staleTime: REFERENCE_STALE_MS,
      },
      {
        queryKey: ['reference', 'institutions'],
        queryFn: ({ signal }) => fetchInstitutions(signal),
        staleTime: REFERENCE_STALE_MS,
      },
      {
        queryKey: ['reference', 'fields-of-study'],
        queryFn: ({ signal }) => fetchFieldsOfStudy(signal),
        staleTime: REFERENCE_STALE_MS,
      },
    ],
  })
  const [districts, levels, institutions, fields] = results
  const failed = results.find((result) => result.isError)
  return {
    isPending: results.some((result) => result.isPending),
    isError: Boolean(failed),
    error: failed?.error ?? null,
    refetch: () => results.forEach((result) => void result.refetch()),
    isFetching: results.some((result) => result.isFetching),
    districts: districts.data ?? [],
    levels: levels.data ?? [],
    institutions: institutions.data ?? [],
    fields: fields.data ?? [],
  }
}

export function useSkillSearch(query: string) {
  return useQuery({
    queryKey: ['reference', 'skills', query],
    queryFn: ({ signal }) => searchSkills(query, signal),
    staleTime: REFERENCE_STALE_MS,
    placeholderData: (previous) => previous, // keep the old list while the next one loads
  })
}
