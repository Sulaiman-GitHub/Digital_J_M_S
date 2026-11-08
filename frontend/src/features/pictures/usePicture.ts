import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deletePicture, fetchPicture, uploadPicture, type PictureKind } from '../../api/pictures'
import type { Picture } from '../../api/types'

export const pictureKey = (kind: PictureKind) => ['picture', kind] as const

/** Details of the caller's photo or logo; null when there is none. `enabled` false skips it. */
export function usePicture(kind: PictureKind, enabled = true) {
  return useQuery<Picture | null>({
    queryKey: pictureKey(kind),
    queryFn: ({ signal }) => fetchPicture(kind, signal),
    staleTime: 60_000,
    enabled,
    retry: false,
  })
}

export function useUploadPicture(kind: PictureKind) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadPicture(kind, file),
    onSuccess: (picture) => queryClient.setQueryData(pictureKey(kind), picture),
  })
}

export function useDeletePicture(kind: PictureKind) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deletePicture(kind),
    onSuccess: () => queryClient.setQueryData(pictureKey(kind), null),
  })
}
