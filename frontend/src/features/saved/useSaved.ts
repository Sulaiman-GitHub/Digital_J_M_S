import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSavedIds, listSaved, saveVacancy, unsaveVacancy } from '../../api/saved'

export const SAVED_IDS_KEY = ['saved', 'ids'] as const
const SAVED_LIST_KEY = ['saved', 'list'] as const

/** Ids of the saved open vacancies. Every card asks for it; react-query makes one request. */
export function useSavedIds(enabled: boolean) {
  return useQuery<string[]>({
    queryKey: SAVED_IDS_KEY,
    queryFn: ({ signal }) => fetchSavedIds(signal),
    staleTime: 60_000,
    enabled,
    retry: false,
  })
}

export function useSavedJobs(page: number) {
  return useQuery({
    queryKey: [...SAVED_LIST_KEY, page],
    queryFn: ({ signal }) => listSaved(page, signal),
    placeholderData: (previous) => previous,
  })
}

/** Save or unsave one vacancy. The bookmark changes at once and goes back if the server says no. */
export function useToggleSaved() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ vacancyId, save }: { vacancyId: string; save: boolean }) =>
      save ? saveVacancy(vacancyId) : unsaveVacancy(vacancyId),
    onMutate: async ({ vacancyId, save }) => {
      await queryClient.cancelQueries({ queryKey: SAVED_IDS_KEY })
      const previous = queryClient.getQueryData<string[]>(SAVED_IDS_KEY)
      const without = (previous ?? []).filter((id) => id !== vacancyId)
      queryClient.setQueryData<string[]>(SAVED_IDS_KEY, save ? [vacancyId, ...without] : without)
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(SAVED_IDS_KEY, context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SAVED_IDS_KEY })
      void queryClient.invalidateQueries({ queryKey: SAVED_LIST_KEY })
    },
  })
}
