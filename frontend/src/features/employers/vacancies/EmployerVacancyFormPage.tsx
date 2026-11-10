import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, type ManagedVacancy } from '../../../api/types'
import { Alert } from '../../../components/Alert'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { ErrorState } from '../../../components/ErrorState'
import { Modal } from '../../../components/Modal'
import { Skeleton } from '../../../components/Skeleton'
import { useToast } from '../../../components/toastContext'
import { useUnsavedChangesWarning } from '../../profile/useUnsavedChangesWarning'
import { PublishButton } from '../PublishButton'
import {
  useCloseVacancy,
  useCreateVacancy,
  useMyVacancy,
  usePublishVacancy,
  useUpdateVacancy,
} from './useManagedVacancies'
import { useLeaveWhenClean, useVacancyForm, useVacancyLists } from './useVacancyForm'
import { VacancyFields } from './VacancyFields'
import { emptyVacancy, fromVacancy, toPayload } from './vacancySchema'
import { vacancyBadge } from './vacancyStatus'

/** Create or edit one vacancy (mockup S10): `/employer/vacancies/new` and `/employer/vacancies/:id`. */
export function EmployerVacancyFormPage() {
  const { id } = useParams()
  const vacancy = useMyVacancy(id)
  const lists = useVacancyLists()

  if ((id && vacancy.isPending) || lists.isPending) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading the vacancy</span>
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (id && vacancy.isError) {
    const missing = vacancy.error instanceof ApiError && vacancy.error.status === 404
    return missing ? (
      <section className="space-y-3">
        <h1 className="text-title-md font-semibold">Vacancy not found</h1>
        <Link to="/employer" className="text-primary underline">
          Back to your vacancies
        </Link>
      </section>
    ) : (
      <ErrorState
        title="Could not load this vacancy"
        message="We could not reach the server. Check your connection and try again."
        retrying={vacancy.isFetching}
        onRetry={() => void vacancy.refetch()}
      />
    )
  }

  if (lists.isError) {
    return (
      <ErrorState
        title="Could not load the form"
        message="We could not reach the server. Check your connection and try again."
        retrying={lists.isFetching}
        onRetry={lists.refetch}
      />
    )
  }

  const current = vacancy.data ?? null
  if (current?.status === 'closed') {
    return (
      <section className="space-y-3">
        <Link to="/employer" className="text-sm text-primary underline">
          ‹ Your vacancies
        </Link>
        <h1 className="text-title-md font-semibold">{current.title}</h1>
        <Alert tone="info">This vacancy is closed. It cannot be changed or reopened.</Alert>
      </section>
    )
  }

  return (
    <VacancyEditor
      key={current?.id ?? 'new'}
      vacancy={current}
      districts={lists.districts}
      levels={lists.levels}
    />
  )
}

function VacancyEditor({
  vacancy,
  districts,
  levels,
}: {
  vacancy: ManagedVacancy | null
  districts: ReturnType<typeof useVacancyLists>['districts']
  levels: ReturnType<typeof useVacancyLists>['levels']
}) {
  const toast = useToast()
  const tools = useVacancyForm(
    vacancy ? fromVacancy(vacancy) : emptyVacancy,
    vacancy?.published_at ?? null,
  )
  const { form } = tools
  const create = useCreateVacancy()
  const update = useUpdateVacancy(vacancy?.id ?? '')
  const publish = usePublishVacancy()
  const close = useCloseVacancy()
  const [confirmingClose, setConfirmingClose] = useState(false)
  const blocker = useUnsavedChangesWarning(form.formState.isDirty)
  const leaveTo = useLeaveWhenClean(form)

  const published = vacancy?.status === 'published'
  const busy = create.isPending || update.isPending || publish.isPending

  /** Save the form (creating the draft the first time). Returns the saved vacancy, or null. */
  async function save(): Promise<ManagedVacancy | null> {
    const saved = await (vacancy
      ? update.mutateAsync(toPayload(form.getValues()))
      : create.mutateAsync(toPayload(form.getValues())))
    form.reset(fromVacancy(saved)) // clean again: no unsaved-changes warning
    return saved
  }

  async function onSaveDraft() {
    tools.clearProblems()
    if (!(await form.trigger())) return
    try {
      const saved = await save()
      if (!saved) return
      toast.show({ message: published ? 'Changes saved.' : 'Draft saved.', tone: 'success' })
      if (!vacancy) leaveTo(`/employer/vacancies/${saved.id}`, true)
    } catch (error) {
      tools.showServerProblem(error)
    }
  }

  async function onPublish() {
    if (!(await tools.checkForPublishing())) return
    try {
      const saved = await save()
      if (!saved) return
      try {
        await publish.mutateAsync(saved.id)
      } catch (error) {
        // The draft is saved; stay here (on its own address) and show what is missing.
        // Moving to the saved draft's own address replaces this page, so the message goes along.
        if (!vacancy) {
          const refused = error instanceof ApiError && error.status > 0 && error.status < 500
          leaveTo(`/employer/vacancies/${saved.id}`, true, refused ? error.message : undefined)
        }
        tools.showServerProblem(error)
        return
      }
      toast.show({ message: 'Vacancy published.', tone: 'success' })
      leaveTo('/employer')
    } catch (error) {
      tools.showServerProblem(error)
    }
  }

  async function onClose() {
    if (!vacancy) return
    try {
      await close.mutateAsync(vacancy.id)
      setConfirmingClose(false)
      form.reset(form.getValues())
      toast.show({ message: published ? 'Vacancy closed.' : 'Draft discarded.', tone: 'success' })
      leaveTo('/employer')
    } catch (error) {
      setConfirmingClose(false)
      tools.showServerProblem(error)
    }
  }

  const badge = vacancy ? vacancyBadge(vacancy) : null

  return (
    <section aria-labelledby="vacancy-title" className="max-w-2xl space-y-4">
      <div>
        <Link to="/employer" className="text-sm text-primary underline">
          ‹ Your vacancies
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 id="vacancy-title" className="text-title-md font-semibold">
            {vacancy ? 'Edit vacancy' : 'New vacancy'}
          </h1>
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
      </div>

      {tools.failure && <Alert>{tools.failure}</Alert>}

      <form noValidate onSubmit={(event) => event.preventDefault()} aria-label="Vacancy">
        <VacancyFields
          form={form}
          districts={districts}
          levels={levels}
          locked={published}
          range={tools.range}
          requirementsError={tools.requirementsError}
        />

        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-start gap-2 border-t border-border bg-card px-4 py-3 md:static md:mx-0 md:px-0">
          <Button
            variant="secondary"
            onClick={() => void onSaveDraft()}
            loading={busy && !publish.isPending}
          >
            {published ? 'Save changes' : 'Save draft'}
          </Button>
          {!published && (
            <div className="min-w-44 flex-1 md:flex-none">
              <PublishButton fullWidth={false} onClick={() => void onPublish()}>
                Publish
              </PublishButton>
            </div>
          )}
          {vacancy && (
            <Button
              variant="ghost"
              className="text-danger"
              onClick={() => setConfirmingClose(true)}
            >
              {published ? 'Close vacancy…' : 'Discard draft…'}
            </Button>
          )}
        </div>
      </form>

      <Modal
        open={confirmingClose}
        onClose={() => setConfirmingClose(false)}
        title={published ? `Close “${vacancy?.title}”?` : 'Discard this draft?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingClose(false)}>
              {published ? 'Keep it open' : 'Keep it'}
            </Button>
            <Button variant="danger" onClick={() => void onClose()} loading={close.isPending}>
              {published ? 'Close vacancy' : 'Discard draft'}
            </Button>
          </>
        }
      >
        <p>
          {published
            ? 'It disappears from the job list straight away and cannot be reopened. You can post a new vacancy instead.'
            : 'The draft will be removed and cannot be brought back.'}
        </p>
      </Modal>

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
