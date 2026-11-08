import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title" className="space-y-4">
      <h1 id="not-found-title" className="text-title-md font-semibold">
        Page not found
      </h1>
      <p className="text-text-secondary">The page you are looking for does not exist.</p>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center rounded-card font-semibold text-primary underline"
      >
        Go to the home page
      </Link>
    </section>
  )
}
