import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchEmployer, saveEmployer, submitEmployer } from '../../api/employer'
import type { Employer, EmployerInput, VerificationStatus } from '../../api/types'

export const EMPLOYER_KEY = ['employer', 'me'] as const

export function useEmployer(enabled = true) {
  return useQuery<Employer | null>({
    queryKey: EMPLOYER_KEY,
    queryFn: ({ signal }) => fetchEmployer(signal),
    enabled,
    staleTime: 30_000,
  })
}

export function useSaveEmployer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: EmployerInput) => saveEmployer(input),
    onSuccess: (employer) => queryClient.setQueryData(EMPLOYER_KEY, employer),
  })
}

export function useSubmitEmployer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: submitEmployer,
    onSuccess: (employer) => queryClient.setQueryData(EMPLOYER_KEY, employer),
  })
}

export interface EmployerAccess {
  isPending: boolean
  isError: boolean
  /** null: no company profile yet. */
  status: VerificationStatus | null
  /** From the server. The server enforces it again. */
  canPublish: boolean
  retry: () => void
}

/** What the signed-in employer may do. Use it to enable or disable publishing buttons. */
export function useEmployerAccess(): EmployerAccess {
  const query = useEmployer()
  return {
    isPending: query.isPending,
    isError: query.isError,
    status: query.data?.verification_status ?? null,
    canPublish: query.data?.can_publish ?? false,
    retry: () => void query.refetch(),
  }
}
