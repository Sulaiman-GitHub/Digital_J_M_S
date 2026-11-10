import type { ComponentPropsWithoutRef, ElementType } from 'react'
import { cn } from '../lib/cn'

export type CardProps<T extends ElementType = 'div'> = {
  as?: T
} & ComponentPropsWithoutRef<T>

export function Card<T extends ElementType = 'div'>({ as, className, ...rest }: CardProps<T>) {
  const Component: ElementType = as ?? 'div'
  return (
    <Component
      className={cn('block rounded-card border border-border bg-card p-4 shadow-sm', className)}
      {...rest}
    />
  )
}
