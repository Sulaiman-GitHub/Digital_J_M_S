import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch, type FieldPath } from 'react-hook-form'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError, type Profile } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { buttonClasses } from '../../components/buttonStyles'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Skeleton } from '../../components/Skeleton'
import { Stepper } from '../../components/Stepper'
import { useToast } from '../../components/toastContext'
import { serverFieldErrors } from '../../lib/formErrors'
import { ShareCvConsent } from '../consent/ShareCvConsent'
import { CvUploader } from '../cv/CvUploader'
import { PictureUploader } from '../pictures/PictureUploader'
import { useCv } from '../cv/useCvData'
import {
  STEPS,
  STEP_FIELDS,
  createProfileSchema,
  emptyValues,
  firstUnfinishedStep,
  formFieldForServerKey,
  fromProfile,
  savedPercent,
  isStepId,
  stepOfField,
  toPayload,
  type ProfileFormValues,
  type StepId,
} from './schema'
import { BasicsStep } from './steps/BasicsStep'
import { EducationStep } from './steps/EducationStep'
import { ExperienceStep } from './steps/ExperienceStep'
import { SkillsStep } from './steps/SkillsStep'
import { SummaryStep } from './steps/SummaryStep'
import { useProfile, useReferenceLists, useSaveProfile } from './useProfileData'
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning'

type ReferenceLists = ReturnType<typeof useReferenceLists>

const STEP_LEADS: Record<StepId, string> = {
  basics: 'Employers see this when you apply. It takes about 5 minutes.',
  education: 'Where you studied helps employers find the right applicants.',
  skills: 'Pick the skills you have. You can skip this and come back.',
  experience: 'Jobs, internships and volunteering. You can skip this too.',
  summary: 'A few words about you, then check everything.',
  cv: 'Upload your CV and choose who can see it.',
}

const labelOf = (id: StepId) => STEPS.find((step) => step.id === id)?.label ?? id

export function ProfilePage() {
  const profile = useProfile()
  const references = useReferenceLists()
  const { step } = useParams()

  if (profile.isPending || references.isPending) {
    return (
      <div role="status" className="space-y-4 py-2">
        <span className="sr-only">Loading your profile</span>
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (profile.isError || references.isError) {
    return (
      <ErrorState
        title="Could not load your profile"
        message="We could not reach the server. Check your connection and try again."
        retrying={profile.isFetching || references.isFetching}
        onRetry={() => {
          void profile.refetch()
          references.refetch()
        }}
      />
    )
  }

  // Each section has its own address (/profile/education, ...), so Back, Refresh and links work.
  const saved = profile.data != null
  const wanted = isStepId(step) ? step : null
  const lockedWhileUnsaved = wanted === 'skills' || wanted === 'experience' || wanted === 'summary'
  if (!wanted || (!saved && lockedWhileUnsaved)) {
    const target = wanted ? 'basics' : firstUnfinishedStep(profile.data ?? null)
    return <Navigate to={`/profile/${target}`} replace />
  }

  return <ProfileStepper profile={profile.data ?? null} references={references} step={wanted} />
}

function ProfileStepper({
  profile,
  references,
  step,
}: {
  profile: Profile | null
  references: ReferenceLists
  step: StepId
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutation = useSaveProfile()
  const cv = useCv()
  const schema = useMemo(() => createProfileSchema(), [])
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: profile ? fromProfile(profile) : emptyValues(),
    mode: 'onTouched',
  })
  const fullName = useWatch({ control: form.control, name: 'full_name' })
  const [failure, setFailure] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  const dirty = form.formState.isDirty
  const blocker = useUnsavedChangesWarning(dirty, '/profile')

  useEffect(() => {
    // A field that is showing an error is re-checked as the user edits it, so the message goes
    // away the moment the problem is fixed (including problems the server reported).
    // Fields without an error are left alone until the user leaves them.
    return form.subscribe({
      formState: { values: true },
      callback: ({ name }) => {
        // `name` is typed loosely by the library; every name it reports is one of our fields.
        const field = name as FieldPath<ProfileFormValues> | undefined
        if (field && form.getFieldState(field).error) void form.trigger(field)
      },
    })
  }, [form])

  useEffect(() => {
    // Move screen reader and keyboard focus to the new step's heading (not on first load).
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  const saved = profile !== null
  const completed = new Set<string>()
  if (saved) {
    completed.add('basics')
    completed.add('education')
    if (profile.skills.length > 0) completed.add('skills')
    if (profile.experiences.length > 0) completed.add('experience')
    if (profile.summary) completed.add('summary')
  }
  if (cv.data) completed.add('cv')
  // Skills onwards need a saved profile: the server takes name, district, qualification,
  // institution and study status together, which is why Education does the first save.
  const locked = new Set<string>(saved ? [] : ['skills', 'experience', 'summary'])

  function setStep(next: StepId) {
    void navigate(`/profile/${next}`)
  }

  function goTo(next: StepId) {
    setStep(next)
    setFailure(null)
    setJustSaved(false)
  }

  /** The earliest step that has a rule problem in the current answers, if any. */
  function firstInvalidStep(): StepId | null {
    const result = schema.safeParse(form.getValues())
    if (result.success) return null
    const invalid = new Set(result.error.issues.map((issue) => stepOfField(String(issue.path[0]))))
    return STEPS.find((candidate) => invalid.has(candidate.id))?.id ?? null
  }

  function continueFromBasics() {
    void form.trigger(STEP_FIELDS.basics as never).then((valid) => {
      if (valid) goTo('education')
    })
  }

  async function saveAndContinue(next: StepId | null) {
    // PUT replaces the whole profile, so every step must be valid, not only the current one.
    const valid = await form.trigger()
    if (!valid) {
      const target = firstInvalidStep()
      if (target && target !== step) {
        setStep(target)
        setFailure(
          `We could not save yet. Fix the field marked in red on the ${labelOf(target)} step.`,
        )
      }
      return
    }
    try {
      const savedProfile = await mutation.mutateAsync(toPayload(form.getValues()))
      form.reset(fromProfile(savedProfile)) // the form is clean again (no unsaved changes)
      setFailure(null)
      if (next) {
        setStep(next)
        setJustSaved(false)
      } else {
        setJustSaved(true)
      }
    } catch (error) {
      handleSaveError(error)
    }
  }

  function handleSaveError(error: unknown) {
    const messages = serverFieldErrors(error)
    const keys = Object.keys(messages)
    if (keys.length > 0) {
      const formKeys = keys.map(formFieldForServerKey)
      keys.forEach((key, index) =>
        form.setError(formKeys[index] as never, { type: 'server', message: messages[key] }),
      )
      const steps = new Set(formKeys.map((key) => stepOfField(key)))
      const target = STEPS.find((candidate) => steps.has(candidate.id))?.id ?? step
      setStep(target)
      setFailure(
        target === step
          ? 'We could not save yet. Fix the field marked in red.'
          : `We could not save yet. Fix the field marked in red on the ${labelOf(target)} step.`,
      )
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

  const index = STEPS.findIndex((candidate) => candidate.id === step)
  const previous = index > 0 ? STEPS[index - 1].id : null
  const next = index < STEPS.length - 1 ? STEPS[index + 1].id : null
  const saving = mutation.isPending

  function onSubmit() {
    if (step === 'basics') continueFromBasics()
    // Summary saves in place and offers the next step, so "Profile saved" stays visible.
    else void saveAndContinue(step === 'summary' ? null : next)
  }

  return (
    <section aria-labelledby="profile-title" className="md:grid md:grid-cols-[15rem_1fr] md:gap-10">
      <div className="rounded-card border border-border bg-card p-4 shadow-sm md:sticky md:top-6 md:self-start">
        <h1 id="profile-title" className="mb-4 text-title-md font-semibold">
          Your profile
        </h1>
        <Stepper
          steps={STEPS}
          currentId={step}
          completedIds={completed}
          lockedIds={locked}
          onSelect={(id) => goTo(id as StepId)}
          percent={savedPercent(profile)}
          label="Profile progress"
        />
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
        className="mt-6 rounded-card border border-border bg-card p-4 shadow-sm sm:p-6 md:mt-0"
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-title-sm font-semibold outline-none md:text-title-md"
        >
          {labelOf(step)}
        </h2>
        <p className="mt-1 mb-5 text-text-secondary">{STEP_LEADS[step]}</p>

        <div className="space-y-4">
          {failure && <Alert>{failure}</Alert>}
          {justSaved && !dirty && step === 'summary' && (
            <Alert tone="success" title="Profile saved.">
              You are ready to apply.{' '}
              <Link to="/" className="font-semibold underline">
                Browse jobs
              </Link>
            </Alert>
          )}

          {step === 'basics' && <BasicsStep form={form} districts={references.districts} />}
          {step === 'education' && (
            <EducationStep
              form={form}
              institutions={references.institutions}
              levels={references.levels}
              fields={references.fields}
            />
          )}
          {step === 'skills' && <SkillsStep form={form} />}
          {step === 'experience' && <ExperienceStep form={form} />}
          {step === 'cv' && (
            <>
              <section aria-labelledby="photo-title" className="space-y-3">
                <h3 id="photo-title" className="text-title-sm font-semibold">
                  Your photo (optional)
                </h3>
                <PictureUploader kind="photo" name={fullName || 'Me'} />
              </section>
              <section aria-labelledby="cv-title" className="space-y-3">
                <h3 id="cv-title" className="text-title-sm font-semibold">
                  Your CV
                </h3>
                <CvUploader />
              </section>
              <section aria-labelledby="sharing-title" className="space-y-3">
                <h3 id="sharing-title" className="text-title-sm font-semibold">
                  Who can see it
                </h3>
                <ShareCvConsent />
              </section>
            </>
          )}
          {step === 'summary' && (
            <SummaryStep
              form={form}
              districts={references.districts}
              levels={references.levels}
              institutions={references.institutions}
              fields={references.fields}
              onEdit={goTo}
            />
          )}
        </div>

        <div className="sticky bottom-14 z-10 mt-6 flex flex-wrap gap-2 border-t border-border bg-card py-3 md:static md:bottom-auto">
          {previous && (
            <Button variant="secondary" onClick={() => goTo(previous)} disabled={saving}>
              Back
            </Button>
          )}
          {(step === 'skills' || step === 'experience') && next && (
            <Button variant="ghost" onClick={() => goTo(next)} disabled={saving}>
              Skip for now
            </Button>
          )}
          {step !== 'cv' && (
            <Button type="submit" className="min-w-44 flex-1 md:flex-none" loading={saving}>
              {step === 'basics'
                ? 'Continue'
                : step === 'summary'
                  ? 'Save profile'
                  : 'Save and continue'}
            </Button>
          )}
        </div>
        {step === 'summary' && saved && !dirty && (
          <p className="mt-2 text-sm text-text-secondary">
            Everything above is saved.{' '}
            <button
              type="button"
              onClick={() => goTo('cv')}
              className={buttonClasses({ variant: 'ghost' })}
            >
              Next: CV and consent
            </button>{' '}
            <Link to="/account" className={buttonClasses({ variant: 'ghost' })}>
              Go to my account
            </Link>
          </p>
        )}
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
