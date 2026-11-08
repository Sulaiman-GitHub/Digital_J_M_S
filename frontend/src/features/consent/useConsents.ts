import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConsents, setConsent } from '../../api/consents'
import type { Consent, ConsentType } from '../../api/types'

export const CONSENTS_KEY = ['consents', 'me'] as const

export function useConsents() {
  return useQuery<Consent[]>({
    queryKey: CONSENTS_KEY,
    queryFn: ({ signal }) => fetchConsents(signal),
    staleTime: 60_000,
  })
}

export function useSetConsent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, granted }: { type: ConsentType; granted: boolean }) =>
      setConsent(type, granted),
    // The server answers with the consents that are active after the change.
    onSuccess: (active) => queryClient.setQueryData(CONSENTS_KEY, active),
  })
}
