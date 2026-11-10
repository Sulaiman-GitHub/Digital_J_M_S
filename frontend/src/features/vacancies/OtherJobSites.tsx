import { JOB_SITES } from './jobSites'

/**
 * "Look wider": the same search on well-known job sites. Shown on a job and on the job list so a
 * student who has not found a match here can keep looking without leaving the system empty-handed.
 */
export function OtherJobSites({
  words,
  heading = 'See similar roles elsewhere',
}: {
  words: string
  heading?: string
}) {
  const search = words.trim() || 'graduate'
  return (
    <section aria-label={heading} className="rounded-card border border-border bg-card p-4">
      <h2 className="font-semibold">{heading}</h2>
      <p className="mt-0.5 text-sm text-text-secondary">
        These open in a new tab. DJMS is not responsible for what those sites show.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {JOB_SITES.map((site) => (
          <li key={site.name}>
            <a
              href={site.search(search)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary-tint"
            >
              {site.name}
              <span aria-hidden="true">↗</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
