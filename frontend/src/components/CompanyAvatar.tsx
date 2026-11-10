import { useState } from 'react'
import { cn } from '../lib/cn'

// Colour pairs from the design tokens; the same company name always gets the same pair.
const TONES = [
  'bg-primary-tint text-primary',
  'bg-teal-tint text-teal',
  'bg-success-tint text-success',
  'bg-accent-tint text-warning',
  'bg-info-tint text-info',
] as const

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]
  return letters.toUpperCase()
}

function toneFor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return TONES[hash % TONES.length]
}

/**
 * A round badge for a company or a person: their picture when there is one, otherwise their
 * initials on a colour from the design tokens. Decorative: the name is shown next to it.
 */
export function CompanyAvatar({
  name,
  imageUrl,
  size = 'md',
  round = false,
  className,
}: {
  name: string
  /** A logo or photo address. If it fails to load, the initials are shown instead. */
  imageUrl?: string | null
  size?: 'md' | 'lg'
  round?: boolean
  className?: string
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden border border-border font-bold',
        round ? 'rounded-pill' : 'rounded-card',
        size === 'lg' ? 'size-14 text-lg' : 'size-12 text-base',
        showImage ? 'bg-card' : toneFor(name),
        className,
      )}
    >
      {showImage ? (
        <img
          src={imageUrl ?? undefined}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(imageUrl ?? null)}
          className={cn('size-full', round ? 'object-cover' : 'object-contain p-1')}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}
