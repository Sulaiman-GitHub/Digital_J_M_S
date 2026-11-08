import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  closeVacancy,
  createVacancy,
  createVacancyForPartner,
  fetchMyVacancy,
  listMyVacancies,
  publishVacancy,
  updateVacancy,
} from '../../../api/employerVacancies'
import type { ManagedVacancy, VacancyInput, VacancyStatus } from '../../../api/types'

const LIST = 'my-vacancies'
const detailKey = (id: string) => ['my-vacancy', id] as const

export function useMyVacancies(status: VacancyStatus | null, page: number) {
  return useQuery({
    queryKey: [LIST, status, page],
    queryFn: ({ signal }) => listMyVacancies(status, page, signal),
    placeholderData: (previous) => previous,
  })
}

export function useMyVacancy(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id ?? ''),
    queryFn: ({ signal }) => fetchMyVacancy(id as string, signal),
    enabled: Boolean(id),
    retry: false,
  })
}

/** Lists and the public search are out of date after any change. */
function useAfterChange() {
  const queryClient = useQueryClient()
  return (vacancy: ManagedVacancy) => {
    queryClient.setQueryData(detailKey(vacancy.id), vacancy)
    void queryClient.invalidateQueries({ queryKey: [LIST] })
    void queryClient.invalidateQueries({ queryKey: ['vacancies'] })
  }
}

export function useCreateVacancy() {
  const after = useAfterChange()
  return useMutation({
    mutationFn: (input: VacancyInput) => createVacancy(input),
    onSuccess: after,
  })
}

export function useUpdateVacancy(id: string) {
  const after = useAfterChange()
  return useMutation({
    mutationFn: (input: VacancyInput) => updateVacancy(id, input),
    onSuccess: after,
  })
}

export function usePublishVacancy() {
  const after = useAfterChange()
  return useMutation({ mutationFn: (id: string) => publishVacancy(id), onSuccess: after })
}

export function useCloseVacancy() {
  const after = useAfterChange()
  return useMutation({ mutationFn: (id: string) => closeVacancy(id), onSuccess: after })
}

export function useCreateForPartner() {
  const after = useAfterChange()
  return useMutation({
    mutationFn: (args: { input: VacancyInput; employerId: string; publish: boolean }) =>
      createVacancyForPartner(args.input, args.employerId, args.publish),
    onSuccess: after,
  })
}
