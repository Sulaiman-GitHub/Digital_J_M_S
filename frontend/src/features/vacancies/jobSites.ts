export interface JobSite {
  name: string
  /** A search for the same words on that site. Only sites whose search address we know. */
  search: (words: string) => string
}

// Plain search links, opened in a new tab. We do not copy or show their listings.
export const JOB_SITES: JobSite[] = [
  {
    name: 'LinkedIn',
    search: (words) =>
      `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(words)}&location=Uganda`,
  },
  {
    name: 'Indeed',
    search: (words) =>
      `https://www.indeed.com/jobs?q=${encodeURIComponent(words)}&l=${encodeURIComponent('Uganda')}`,
  },
  {
    name: 'Google Jobs',
    search: (words) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${words} jobs in Uganda`)}&ibp=htl;jobs`,
  },
]
