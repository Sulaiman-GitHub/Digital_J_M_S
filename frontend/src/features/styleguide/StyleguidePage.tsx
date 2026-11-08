import { useState, type ReactNode } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Checkbox } from '../../components/Checkbox'
import { Combobox } from '../../components/Combobox'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { FormError } from '../../components/FormError'
import { Modal } from '../../components/Modal'
import { Pagination } from '../../components/Pagination'
import { Pill } from '../../components/Pill'
import { Select } from '../../components/Select'
import { Skeleton } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { StatusTimeline } from '../../components/StatusTimeline'
import { TextArea } from '../../components/TextArea'
import { TextField } from '../../components/TextField'
import { useToast } from '../../components/toastContext'
import { APPLICATION_STATUSES } from '../../lib/applicationStatus'

// Dev-only page (/styleguide) showing every shared component and state. Sample data is fictional.

const institutions = [
  'Busitema University',
  'Gulu University',
  'Kabale University',
  'Kampala International University',
  'Kyambogo University',
  'Makerere University',
  'Mbarara University of Science and Technology',
  'Muni University',
  'Uganda Christian University',
  'Uganda Management Institute',
].map((name) => ({ value: name.toLowerCase().replace(/\W+/g, '-'), label: name }))

const districts = ['Kampala', 'Wakiso', 'Mukono', 'Gulu', 'Mbarara', 'Mbale', 'Jinja'].map((d) => ({
  value: d.toLowerCase(),
  label: d,
}))

const colourTokens = [
  'primary',
  'primary-hover',
  'accent',
  'text',
  'text-secondary',
  'bg',
  'surface',
  'border',
  'success',
  'warning',
  'danger',
  'info',
  'primary-tint',
  'success-tint',
  'warning-tint',
  'danger-tint',
  'info-tint',
  'accent-tint',
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`sg-${title}`} className="space-y-3 border-t border-border pt-6">
      <h2 id={`sg-${title}`} className="text-title-sm font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function StyleguidePage() {
  const toast = useToast()
  const [institution, setInstitution] = useState<string | null>('makerere-university')
  const [page, setPage] = useState(3)
  const [modalOpen, setModalOpen] = useState(false)
  const [jobTypes, setJobTypes] = useState<string[]>(['Full-time'])
  const [activeFilters, setActiveFilters] = useState(['Kampala', 'Internship'])

  const toggleJobType = (type: string) =>
    setJobTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    )

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-title-md font-semibold sm:text-title-lg">Styleguide</h1>
        <p className="text-text-secondary">
          Development only. Tokens: <code>docs/design/tokens.md</code>. Mockups:{' '}
          <code>docs/design/mockups/</code>.
        </p>
      </header>

      <Section title="Colour tokens">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {colourTokens.map((token) => (
            <li key={token} className="text-sm">
              <span
                className="block h-12 rounded-card border border-border"
                style={{ background: `var(--color-${token})` }}
              />
              <code>{token}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <p className="text-title-lg font-semibold">Title large 32 px</p>
        <p className="text-title-md font-semibold">Title medium 24 px</p>
        <p className="text-title-sm font-semibold">Title small 20 px</p>
        <p>Body 16 px, line height 1.5. Plain English, short labels.</p>
        <p className="text-sm text-text-secondary">Small 14 px, secondary, for meta text only.</p>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button loading>Saving</Button>
          <Button variant="secondary" loading>
            Loading
          </Button>
          <Button disabled>Disabled</Button>
        </div>
        <Button fullWidth>Full width (phone primary action)</Button>
      </Section>

      <Section title="Form fields">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Full name" placeholder="e.g. Nakato Sarah" autoComplete="name" />
          <TextField
            label="Email"
            type="email"
            defaultValue="nakato@example"
            error="Enter a valid email address, like name@example.com"
          />
          <TextField label="Phone number" hint="Ugandan number, e.g. 0772 123456" type="tel" />
          <TextField label="Disabled" defaultValue="Cannot edit" disabled />
          <Select label="District" placeholder="All districts" options={districts} />
          <Select
            label="District (error)"
            placeholder="Choose a district"
            options={districts}
            error="Choose your district"
          />
          <Combobox
            label="Institution"
            hint="Start typing to search"
            options={institutions}
            value={institution}
            onChange={setInstitution}
            placeholder="Search institutions"
          />
          <Combobox
            label="Institution (error)"
            options={institutions}
            value={null}
            onChange={() => {}}
            error="Choose your institution from the list"
          />
          <TextArea label="About you" hint="Two or three sentences about your goals." />
          <TextArea label="Cover note (error)" error="Keep it under 1,000 characters" />
        </div>
        <div className="space-y-1">
          <Checkbox label="I agree to share my CV with employers I apply to" />
          <Checkbox label="Send me weekly job alerts" defaultChecked />
          <Checkbox label="I accept the terms" error="You must accept the terms to continue" />
        </div>
        <FormError live>We could not save your profile. Check the fields marked in red.</FormError>
      </Section>

      <Section title="Pill">
        <p className="text-sm text-text-secondary">Toggle filters (aria-pressed)</p>
        <div className="flex flex-wrap gap-2">
          {['Full-time', 'Part-time', 'Contract', 'Internship', 'Graduate trainee'].map((type) => (
            <Pill
              key={type}
              label={type}
              selected={jobTypes.includes(type)}
              onClick={() => toggleJobType(type)}
            />
          ))}
        </div>
        <p className="text-sm text-text-secondary">Active filters (removable)</p>
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((filter) => (
            <Pill
              key={filter}
              label={filter}
              onRemove={() => setActiveFilters((f) => f.filter((x) => x !== filter))}
            />
          ))}
          {activeFilters.length === 0 && (
            <Button variant="ghost" onClick={() => setActiveFilters(['Kampala', 'Internship'])}>
              Reset filters
            </Button>
          )}
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge tone="primary">Full-time</Badge>
          <Badge tone="neutral">Employer site</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="warning">Closing soon</Badge>
          <Badge tone="success">Approved</Badge>
          <Badge tone="danger">Rejected</Badge>
          <Badge tone="outline">Outline</Badge>
        </div>
        <p className="text-sm text-text-secondary">Application statuses</p>
        <div className="flex flex-wrap gap-2">
          {APPLICATION_STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <p className="font-semibold">Plain card</p>
            <p className="text-text-secondary">Border, 8 px radius, 16 px padding.</p>
          </Card>
          <Card as="article" aria-label="Sample vacancy">
            <h3 className="text-lg font-semibold">Graduate Trainee – Accounts</h3>
            <p className="text-text-secondary">Ssese Fresh Foods Ltd</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
              <span>Kampala</span>
              <Badge tone="primary">Full-time</Badge>
            </div>
            <p className="mt-2 font-semibold">UGX 1,200,000 – 1,500,000 / month</p>
            <p className="mt-3 text-sm text-text-secondary">Posted 3 days ago</p>
          </Card>
        </div>
      </Section>

      <Section title="Pagination">
        <Pagination page={page} pageCount={12} onPageChange={setPage} label="Styleguide pages" />
        <Pagination page={1} pageCount={3} onPageChange={() => {}} label="Short pagination" />
      </Section>

      <Section title="Loading, empty and error states">
        <div className="grid gap-4 md:grid-cols-3">
          <Card role="status">
            <span className="sr-only">Loading vacancy</span>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/2" />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-20 rounded-pill" />
            </div>
            <Skeleton className="mt-4 h-4 w-28" />
          </Card>
          <EmptyState
            title="No jobs match your search"
            description="Try removing a filter or searching all districts."
            action={<Button variant="secondary">Clear filters</Button>}
          />
          <ErrorState
            message="We could not load vacancies. Check your connection and try again."
            onRetry={() => toast.show({ message: 'Retrying…', tone: 'info' })}
          />
        </div>
      </Section>

      <Section title="Toast">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => toast.show({ message: 'Profile saved', tone: 'success' })}
          >
            Show success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.show({ message: 'Upload failed. Try again.', tone: 'error' })}
          >
            Show error toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.show({ message: 'Your session will expire soon', tone: 'info' })}
          >
            Show info toast
          </Button>
        </div>
      </Section>

      <Section title="Modal">
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          Open modal
        </Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Withdraw application?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                Withdraw
              </Button>
            </>
          }
        >
          <p>
            You cannot apply to this vacancy again after withdrawing. The employer will see that you
            withdrew.
          </p>
        </Modal>
      </Section>

      <Section title="StatusTimeline">
        <StatusTimeline
          entries={[
            {
              status: 'interview',
              at: '2026-11-03T07:30:00Z',
              note: 'Interview on 10 Nov at 10:00',
            },
            { status: 'shortlisted', at: '2026-10-30T12:05:00Z' },
            { status: 'under_review', at: '2026-10-28T09:00:00Z' },
            { status: 'submitted', at: '2026-10-27T16:42:00Z' },
          ]}
        />
      </Section>
    </div>
  )
}
