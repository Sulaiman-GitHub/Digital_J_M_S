import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteCv, fetchCv, uploadCv } from '../../api/cv'
import type { Cv } from '../../api/types'

export const CV_KEY = ['cv', 'me'] as const

export function useCv() {
  return useQuery<Cv | null>({
    queryKey: CV_KEY,
    queryFn: ({ signal }) => fetchCv(signal),
    staleTime: 60_000,
  })
}

export function useUploadCv() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      file,
      onProgress,
      signal,
    }: {
      file: File
      onProgress?: (percent: number) => void
      signal?: AbortSignal
    }) => uploadCv(file, { onProgress, signal }),
    onSuccess: (cv) => queryClient.setQueryData(CV_KEY, cv),
  })
}

export function useDeleteCv() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCv,
    onSuccess: () => queryClient.setQueryData(CV_KEY, null),
  })
}
