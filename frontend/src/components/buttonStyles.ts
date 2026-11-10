import { cn } from '../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-primary text-on-solid hover:bg-primary-hover',
  secondary: 'border-primary bg-card text-primary hover:bg-primary-tint',
  ghost: 'border-transparent bg-transparent text-primary hover:bg-primary-tint',
  danger: 'border-transparent bg-danger text-on-solid hover:opacity-90',
}

/** Classes shared by Button and by links that should look like buttons. */
export function buttonClasses({
  variant = 'primary',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant
  fullWidth?: boolean
  className?: string
} = {}): string {
  return cn(
    'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-card border px-4 font-semibold whitespace-nowrap transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variantClasses[variant],
    fullWidth && 'w-full',
    className,
  )
}
