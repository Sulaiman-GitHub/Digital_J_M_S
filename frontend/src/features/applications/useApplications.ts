import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyToVacancy,
  changeApplicationStatus,
  fetchApplication,
  fetchMyApplicationFor,
  listApplicants,
  listMyApplications,
  withdrawApplication,
} from '../../api/applications'
import type { ApplicationDetail, ApplicationStatus, ApplyInput } from '../../api/types'

export const APPLICATIONS_KEY = ['applications'] as const

export function useMyApplications(page: number) {
  return useQuery({
    queryKey: [...APPLICATIONS_KEY, 'list', page],
    queryFn: ({ signal }) => listMyApplications(page, signal),
    placeholderData: (previous) => previous,
  })
}

/** The caller's application for one vacancy (null if none). Only asked of job seekers. */
export function useMyApplicationFor(vacancyId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...APPLICATIONS_KEY, 'for-vacancy', vacancyId],
    queryFn: ({ signal }) => fetchMyApplicationFor(vacancyId, signal),
    enabled,
  })
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: [...APPLICATIONS_KEY, 'detail', id],
    queryFn: ({ signal }) => fetchApplication(id, signal),
    retry: false,
  })
}

export function useApply(vacancyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ApplyInput) => applyToVacancy(vacancyId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY }),
  })
}

export function useWithdraw(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => withdrawApplication(id),
    onSuccess: (detail: ApplicationDetail) => {
      queryClient.setQueryData([...APPLICATIONS_KEY, 'detail', id], detail)
      void queryClient.invalidateQueries({ queryKey: [...APPLICATIONS_KEY, 'list'] })
      void queryClient.invalidateQueries({ queryKey: [...APPLICATIONS_KEY, 'for-vacancy'] })
    },
  })
}

/** An employer's applicants for one vacancy, optionally only those in one status. */
export function useApplicants(vacancyId: string, status: ApplicationStatus | null, page: number) {
  return useQuery({
    queryKey: [...APPLICATIONS_KEY, 'applicants', vacancyId, status, page],
    queryFn: ({ signal }) => listApplicants(vacancyId, status, page, signal),
    placeholderData: (previous) => previous,
  })
}

export function useChangeStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ status, note }: { status: ApplicationStatus; note: string | null }) =>
      changeApplicationStatus(id, status, note),
    onSuccess: (detail: ApplicationDetail) => {
      queryClient.setQueryData([...APPLICATIONS_KEY, 'detail', id], detail)
      void queryClient.invalidateQueries({ queryKey: [...APPLICATIONS_KEY, 'applicants'] })
      // The vacancy list on the dashboard shows how many applicants are new.
      void queryClient.invalidateQueries({ queryKey: ['my-vacancies'] })
    },
  })
}
