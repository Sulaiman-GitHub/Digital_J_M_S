import { Skeleton } from '../../components/Skeleton'

export function CardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Loading jobs</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-2 rounded-card border border-border p-4">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  )
}
