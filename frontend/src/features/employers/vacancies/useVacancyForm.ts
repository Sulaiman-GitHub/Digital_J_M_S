import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm, type FieldPath, type UseFormReturn } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchDistricts, fetchQualificationLevels } from '../../../api/reference'
import { ApiError } from '../../../api/types'
import { useToast } from '../../../components/toastContext'
import { serverFieldErrors } from '../../../lib/formErrors'
import {
  closingRange,
  createDraftSchema,
  formFieldForServerKey,
  publishProblems,
  type ClosingRange,
  type VacancyFormValues,
} from './vacancySchema'

const REFERENCE_STALE_MS = 60 * 60 * 1000

export function useVacancyLists() {
  const districts = useQuery({
    queryKey: ['reference', 'districts'],
    queryFn: ({ signal }) => fetchDistricts(signal),
    staleTime: REFERENCE_STALE_MS,
  })
  const levels = useQuery({
    queryKey: ['reference', 'qualification-levels'],
    queryFn: ({ signal }) => fetchQualificationLevels(signal),
    staleTime: REFERENCE_STALE_MS,
  })
  return {
    districts: districts.data ?? [],
    levels: levels.data ?? [],
    isPending: districts.isPending || levels.isPending,
    isError: districts.isError || levels.isError,
    isFetching: districts.isFetching || levels.isFetching,
    refetch: () => {
      void districts.refetch()
      void levels.refetch()
    },
  }
}

export interface VacancyFormTools {
  form: UseFormReturn<VacancyFormValues>
  range: ClosingRange
  /** A message above the form, and the requirement-level message under the requirements. */
  failure: string | null
  requirementsError: string | undefined
  clearProblems: () => void
  /** Show what the server refused. Returns true if it was shown on fields or above the form. */
  showServerProblem: (error: unknown) => boolean
  /** Check the rules for going live; marks the fields that are missing. */
  checkForPublishing: () => Promise<boolean>
}

/**
 * The form state shared by the employer page and the admin page: validation for drafts, the extra
 * checks for publishing, and the mapping of server errors onto fields.
 */
export function useVacancyForm(
  defaults: VacancyFormValues,
  publishedAt: string | null,
): VacancyFormTools {
  const range = useMemo(() => closingRange(publishedAt), [publishedAt])
  const schema = useMemo(() => createDraftSchema(range), [range])
  const toast = useToast()
  const form = useForm<VacancyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: 'onTouched',
  })
  // A problem sent along with a navigation (see useLeaveWhenClean) is shown straight away.
  const location = useLocation()
  const [failure, setFailure] = useState<string | null>(
    () => (location.state as { problem?: string } | null)?.problem ?? null,
  )
  const [requirementsError, setRequirementsError] = useState<string | undefined>()

  function clearProblems() {
    setFailure(null)
    setRequirementsError(undefined)
  }

  function showServerProblem(error: unknown): boolean {
    clearProblems()
    const messages = serverFieldErrors(error)
    let marked = 0
    for (const [key, message] of Object.entries(messages)) {
      const field = formFieldForServerKey(key)
      if (field === 'requirements') {
        setRequirementsError(message)
        marked += 1
      } else if (field in form.getValues()) {
        form.setError(field as FieldPath<VacancyFormValues>, { type: 'server', message })
        marked += 1
      }
    }
    if (marked > 0) {
      setFailure('We could not save yet. Fix the fields marked in red.')
      return true
    }
    if (error instanceof ApiError && error.status !== 0 && error.status < 500) {
      setFailure(error.message)
      return true
    }
    toast.show({
      message:
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      tone: 'error',
    })
    return false
  }

  async function checkForPublishing(): Promise<boolean> {
    clearProblems()
    const valid = await form.trigger()
    const problems = publishProblems(form.getValues())
    for (const [field, message] of Object.entries(problems)) {
      form.setError(field as FieldPath<VacancyFormValues>, { type: 'publish', message })
    }
    const ok = valid && Object.keys(problems).length === 0
    if (!ok) setFailure('Complete the fields marked in red before you publish.')
    return ok
  }

  return {
    form,
    range,
    failure,
    requirementsError,
    clearProblems,
    showServerProblem,
    checkForPublishing,
  }
}

/**
 * Leave the page once the form is clean. After a successful save the form is reset, but it only
 * counts as clean on the next render; going at once would trip the unsaved-changes warning.
 *
 * Call it AFTER useUnsavedChangesWarning in the component: effects run in order, and the router's
 * blocker must have seen "not dirty" before this navigates.
 */
export function useLeaveWhenClean(form: UseFormReturn<VacancyFormValues>) {
  const navigate = useNavigate()
  const [target, setTarget] = useState<{
    to: string
    replace: boolean
    problem?: string
  } | null>(null)
  const dirty = form.formState.isDirty
  useEffect(() => {
    if (target && !dirty) {
      navigate(target.to, {
        replace: target.replace,
        state: target.problem ? { problem: target.problem } : undefined,
      })
    }
  }, [target, dirty, navigate])
  /** `problem` is shown above the form on the page we arrive at (this page is gone by then). */
  return (to: string, replace = false, problem?: string) => setTarget({ to, replace, problem })
}
