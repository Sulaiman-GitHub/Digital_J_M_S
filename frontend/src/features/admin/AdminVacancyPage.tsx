import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listPartnerEmployers } from '../../api/adminEmployers'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { ErrorState } from '../../components/ErrorState'
import { Select } from '../../components/Select'
import { Skeleton } from '../../components/Skeleton'
import { useToast } from '../../components/toastContext'
import { useUnsavedChangesWarning } from '../profile/useUnsavedChangesWarning'
import { Modal } from '../../components/Modal'
import { useCreateForPartner } from '../employers/vacancies/useManagedVacancies'
import {
  useLeaveWhenClean,
  useVacancyForm,
  useVacancyLists,
} from '../employers/vacancies/useVacancyForm'
import { VacancyFields } from '../employers/vacancies/VacancyFields'
import { emptyVacancy, toPayload } from '../employers/vacancies/vacancySchema'

/** An admin writes a vacancy for an approved partner employer. */
export function AdminVacancyPage() {
  const lists = useVacancyLists()
  const partners = useQuery({
    queryKey: ['admin-employers', 'partners'],
    queryFn: ({ signal }) => listPartnerEmployers(signal),
  })

  if (lists.isPending || partners.isPending) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading the form</span>
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (lists.isError || partners.isError) {
    return (
      <ErrorState
        title="Could not load the form"
        message="We could not reach the server. Check your connection and try again."
        retrying={lists.isFetching || partners.isFetching}
        onRetry={() => {
          lists.refetch()
          void partners.refetch()
        }}
      />
    )
  }

  return (
    <AdminVacancyForm
      districts={lists.districts}
      levels={lists.levels}
      partners={partners.data.data.map((item) => ({
        value: item.id,
        label: `${item.company_name} (${item.owner_email})`,
      }))}
    />
  )
}

function AdminVacancyForm({
  districts,
  levels,
  partners,
}: {
  districts: ReturnType<typeof useVacancyLists>['districts']
  levels: ReturnType<typeof useVacancyLists>['levels']
  partners: { value: string; label: string }[]
}) {
  const toast = useToast()
  const tools = useVacancyForm(emptyVacancy, null)
  const create = useCreateForPartner()
  const [employerId, setEmployerId] = useState('')
  const [employerError, setEmployerError] = useState<string | undefined>()
  const blocker = useUnsavedChangesWarning(tools.form.formState.isDirty)
  const leaveTo = useLeaveWhenClean(tools.form)

  async function submit(publish: boolean) {
    tools.clearProblems()
    setEmployerError(undefined)
    const chosen = employerId !== ''
    if (!chosen) setEmployerError('Choose the partner employer')
    const valid = publish ? await tools.checkForPublishing() : await tools.form.trigger()
    if (!chosen || !valid) return
    try {
      await create.mutateAsync({
        input: toPayload(tools.form.getValues()),
        employerId,
        publish,
      })
      tools.form.reset(tools.form.getValues())
      toast.show({
        message: publish ? 'Vacancy created and published.' : 'Draft created for the partner.',
        tone: 'success',
      })
      leaveTo('/admin/employers')
    } catch (error) {
      tools.showServerProblem(error)
    }
  }

  return (
    <section aria-labelledby="admin-vacancy-title" className="max-w-2xl space-y-4">
      <div>
        <Link to="/admin/employers" className="text-sm text-primary underline">
          ‹ All employers
        </Link>
        <h1 id="admin-vacancy-title" className="mt-1 text-title-md font-semibold">
          New vacancy for a partner
        </h1>
      </div>

      {partners.length === 0 && (
        <Alert tone="info">
          There are no approved employers yet. Approve an employer first, then come back.
        </Alert>
      )}
      {tools.failure && <Alert>{tools.failure}</Alert>}

      <form noValidate onSubmit={(event) => event.preventDefault()} aria-label="Vacancy">
        <div className="space-y-4">
          <Card as="section" aria-label="Employer" className="space-y-3">
            <h2 className="text-title-sm font-semibold">Employer</h2>
            <Select
              label="Partner employer"
              placeholder="Choose an employer"
              hint="Only approved employers are listed."
              options={partners}
              value={employerId}
              onChange={(event) => setEmployerId(event.target.value)}
              error={employerError}
            />
          </Card>
          <VacancyFields
            form={tools.form}
            districts={districts}
            levels={levels}
            locked={false}
            range={tools.range}
            requirementsError={tools.requirementsError}
          />
        </div>
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap gap-2 border-t border-border bg-card px-4 py-3 md:static md:mx-0 md:px-0">
          <Button variant="secondary" onClick={() => void submit(false)} loading={create.isPending}>
            Save draft
          </Button>
          <Button onClick={() => void submit(true)} loading={create.isPending}>
            Create and publish
          </Button>
        </div>
      </form>

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        footer={
          <>
            <Button variant="ghost" onClick={() => blocker.proceed?.()}>
              Leave
            </Button>
            <Button onClick={() => blocker.reset?.()}>Keep editing</Button>
          </>
        }
      >
        <p>You have changes that are not saved. If you leave now they will be lost.</p>
      </Modal>
    </section>
  )
}
