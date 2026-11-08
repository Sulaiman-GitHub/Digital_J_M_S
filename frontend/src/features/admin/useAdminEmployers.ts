import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveEmployer,
  fetchEmployerDetail,
  listEmployers,
  rejectEmployer,
  suspendEmployer,
} from '../../api/adminEmployers'
import type { AdminEmployerDetail, VerificationStatus } from '../../api/types'

const QUEUE = 'admin-employers'
const detailKey = (id: string) => ['admin-employer', id] as const

export function useEmployerQueue(status: VerificationStatus | null, page: number) {
  return useQuery({
    queryKey: [QUEUE, status, page],
    queryFn: ({ signal }) => listEmployers(status, page, signal),
    placeholderData: (previous) => previous, // keep the old page while the next one loads
  })
}

export function useEmployerDetail(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: ({ signal }) => fetchEmployerDetail(id, signal),
  })
}

export type Decision =
  { kind: 'approve' } | { kind: 'reject'; reason: string } | { kind: 'suspend'; reason: string }

export function useDecide(id: string) {
  const queryClient = useQueryClient()
  return useMutation<AdminEmployerDetail, Error, Decision>({
    mutationFn: (decision) => {
      if (decision.kind === 'approve') return approveEmployer(id)
      if (decision.kind === 'reject') return rejectEmployer(id, decision.reason)
      return suspendEmployer(id, decision.reason)
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(detailKey(id), detail)
      // The queue's counts and rows are out of date now.
      void queryClient.invalidateQueries({ queryKey: [QUEUE] })
    },
  })
}

export function refreshEmployer(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  return queryClient.invalidateQueries({ queryKey: detailKey(id) })
}
