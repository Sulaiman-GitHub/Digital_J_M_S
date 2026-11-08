import type { ReactNode } from 'react'
import { Alert } from '../../components/Alert'

/** Shared layout for the Terms and Privacy pages. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-prose space-y-4 py-2">
      <h1 className="text-title-md font-semibold">{title}</h1>
      <Alert tone="info" title="Draft text.">
        This page is a plain-language placeholder. It is to be reviewed by a lawyer before the
        service opens to the public.
      </Alert>
      {children}
    </article>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-title-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}
