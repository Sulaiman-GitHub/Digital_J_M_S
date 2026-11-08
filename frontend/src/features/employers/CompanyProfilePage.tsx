import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchDistricts } from '../../api/reference'
import { ApiError, type Employer } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Select } from '../../components/Select'
import { Skeleton } from '../../components/Skeleton'
import { TextArea } from '../../components/TextArea'
import { TextField } from '../../components/TextField'
import { useToast } from '../../components/toastContext'
import { applyFieldErrors } from '../../lib/formErrors'
import { useAuth } from '../auth/authContext'
import {
  COMPANY_FIELDS,
  DESCRIPTION_MAX,
  companySchema,
  emptyCompany,
  fromEmployer,
  missingForSubmission,
  toPayload,
  type CompanyValues,
} from './companySchema'
import { PictureUploader } from '../pictures/PictureUploader'
import { isLocked } from './verification'
import { useEmployer, useSaveEmployer, useSubmitEmployer } from './useEmployerData'

export function CompanyProfilePage() {
  const employer = useEmployer()
  const districts = useQuery({
    queryKey: ['reference', 'districts'],
    queryFn: ({ signal }) => fetchDistricts(signal),
    staleTime: 60 * 60 * 1000,
  })

  if (employer.isPending || districts.isPending) {
    return (
      <div role="status" className="space-y-4 py-2">
        <span className="sr-only">Loading your company profile</span>
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (employer.isError || districts.isError) {
    return (
      <ErrorState
        title="Could not load your company profile"
        message="We could not reach the server. Check your connection and try again."
        retrying={employer.isFetching || districts.isFetching}
        onRetry={() => {
          void employer.refetch()
          void districts.refetch()
        }}
      />
    )
  }

  return (
    <CompanyForm
      employer={employer.data ?? null}
      districts={districts.data.map((district) => ({ value: district.id, label: district.name }))}
    />
  )
}

function CompanyForm({
  employer,
  districts,
}: {
  employer: Employer | null
  districts: { value: string; label: string }[]
}) {
  const { user } = useAuth()
  const toast = useToast()
  const save = useSaveEmployer()
  const submit = useSubmitEmployer()
  const form = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: employer ? fromEmployer(employer) : emptyCompany,
    mode: 'onTouched',
  })
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = form
  const [failure, setFailure] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const status = employer?.verification_status ?? null
  const locked = isLocked(status)
  const canSubmit = status === null || status === 'draft' || status === 'rejected'
  const emailVerified = user?.email_verified ?? false
  const description = useWatch({ control: form.control, name: 'description' })

  // Keep the form in step with the server after a save or a status change.
  useEffect(() => {
    if (employer && !isDirty) reset(fromEmployer(employer))
  }, [employer, isDirty, reset])

  function handleError(error: unknown) {
    if (applyFieldErrors(error, setError, COMPANY_FIELDS)) {
      setFailure('We could not save yet. Fix the fields marked in red.')
      return
    }
    if (error instanceof ApiError && error.status !== 0 && error.status < 500) {
      setFailure(error.message)
      return
    }
    toast.show({
      message:
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      tone: 'error',
    })
  }

  const onSave = handleSubmit(async (values) => {
    setFailure(null)
    try {
      const saved = await save.mutateAsync(toPayload(values))
      reset(fromEmployer(saved))
      toast.show({
        message:
          saved.verification_status === 'pending' && status === 'approved'
            ? 'Saved. Because you changed the name or registration number, we will check your company again.'
            : 'Company profile saved.',
        tone: 'success',
      })
    } catch (error) {
      handleError(error)
    }
  })

  async function onConfirmSubmit() {
    setFailure(null)
    try {
      await submit.mutateAsync()
      setConfirming(false)
      toast.show({ message: 'Sent for verification.', tone: 'success' })
    } catch (error) {
      setConfirming(false)
      handleError(error)
      if (error instanceof ApiError && error.code === 'profile_incomplete') {
        setFailure('Complete the fields marked in red, then send it again.')
      }
    }
  }

  let submitBlocked: string | null = null
  if (!employer) submitBlocked = 'Save your profile first.'
  else if (isDirty) submitBlocked = 'Save your changes first.'
  else if (!emailVerified) submitBlocked = 'Verify your email address first. We sent you a link.'
  else if (missingForSubmission(employer).length > 0) {
    submitBlocked = `Add ${missingForSubmission(employer).join(', ')}, then save, before you submit.`
  }

  return (
    <section aria-labelledby="company-title" className="max-w-xl space-y-4">
      <div>
        <h1 id="company-title" className="text-title-md font-semibold">
          Company profile
        </h1>
        <Link to="/employer" className="text-sm text-primary underline">
          Back to your company
        </Link>
      </div>

      {locked && (
        <Alert tone="info">
          Your profile is read-only while it is being checked or while your company is suspended.
        </Alert>
      )}
      {status === 'approved' && (
        <Alert tone="info">
          Changing the company name or registration number sends the profile back for checking, and
          you cannot post vacancies until it is approved again.
        </Alert>
      )}
      {failure && <Alert>{failure}</Alert>}

      <section aria-labelledby="logo-title" className="space-y-3">
        <h2 id="logo-title" className="text-title-sm font-semibold">
          Company logo (optional)
        </h2>
        <PictureUploader kind="logo" name={employer?.company_name ?? 'Company'} />
      </section>

      <form noValidate onSubmit={onSave} className="space-y-4" aria-label="Company profile">
        <fieldset disabled={locked} className="space-y-4">
          <TextField
            label="Company name"
            autoComplete="organization"
            error={errors.company_name?.message}
            {...register('company_name')}
          />
          <TextField
            label="Registration number"
            hint="As on your certificate of incorporation."
            error={errors.registration_number?.message}
            {...register('registration_number')}
          />
          <TextField
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            error={errors.contact_phone?.message}
            {...register('contact_phone')}
          />
          <TextField
            label="Website (optional)"
            inputMode="url"
            placeholder="https://"
            hint="A phone number or a website is needed so we can check the company."
            error={errors.website?.message}
            {...register('website')}
          />
          <Select
            label="District"
            placeholder="Choose a district"
            options={districts}
            error={errors.district_id?.message}
            {...register('district_id')}
          />
          <div>
            <TextArea
              label="What does your company do?"
              error={errors.description?.message}
              {...register('description')}
            />
            <p className="text-right text-sm text-text-secondary">
              {description.length} of {DESCRIPTION_MAX}
            </p>
          </div>
        </fieldset>

        {!locked && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={save.isPending}>
              {employer ? 'Save changes' : 'Save'}
            </Button>
            {canSubmit && (
              <Button
                aria-disabled={submitBlocked ? true : undefined}
                aria-describedby={submitBlocked ? 'submit-why' : undefined}
                onClick={() => {
                  if (!submitBlocked) setConfirming(true)
                }}
                className={submitBlocked ? 'cursor-not-allowed opacity-60' : undefined}
              >
                Submit for verification
              </Button>
            )}
          </div>
        )}
        {!locked && canSubmit && submitBlocked && (
          <p id="submit-why" className="text-sm text-text-secondary">
            {submitBlocked}
          </p>
        )}
      </form>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Submit for verification?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onConfirmSubmit()} loading={submit.isPending}>
              Submit
            </Button>
          </>
        }
      >
        <p>You cannot edit your profile while we check it.</p>
      </Modal>
    </section>
  )
}
