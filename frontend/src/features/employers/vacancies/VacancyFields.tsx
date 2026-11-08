import { useWatch, type UseFormReturn } from 'react-hook-form'
import type { District, QualificationLevel } from '../../../api/types'
import { Card } from '../../../components/Card'
import { Checkbox } from '../../../components/Checkbox'
import { FormError } from '../../../components/FormError'
import { Select } from '../../../components/Select'
import { TextArea } from '../../../components/TextArea'
import { TextField } from '../../../components/TextField'
import { formatDate } from '../../../lib/dates'
import { ARRANGEMENT_LABELS, EMPLOYMENT_LABELS } from '../../vacancies/format'
import { RequirementsEditor } from './RequirementsEditor'
import { DESCRIPTION_MAX, type ClosingRange, type VacancyFormValues } from './vacancySchema'

export interface VacancyFieldsProps {
  form: UseFormReturn<VacancyFormValues>
  districts: District[]
  levels: QualificationLevel[]
  /** A published vacancy keeps its title, type, place and how to apply. */
  locked: boolean
  range: ClosingRange
  /** Server-side problems with the requirements as a whole. */
  requirementsError?: string
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card as="section" aria-label={title} className="space-y-4">
      <h2 className="text-title-sm font-semibold">{title}</h2>
      {children}
    </Card>
  )
}

/** The sections of the vacancy form (mockup S10). Used by employers and by admins. */
export function VacancyFields({
  form,
  districts,
  levels,
  locked,
  range,
  requirementsError,
}: VacancyFieldsProps) {
  const {
    register,
    control,
    formState: { errors },
  } = form
  const description = useWatch({ control, name: 'description' })
  const arrangement = useWatch({ control, name: 'work_arrangement' })
  const method = useWatch({ control, name: 'application_method' })

  return (
    <div className="space-y-4">
      {locked && (
        <p className="rounded-card border border-info bg-info-tint p-3 text-sm">
          This vacancy is live. The title, job type, place and how people apply cannot be changed.
          You can change the description, requirements, pay and closing date.
        </p>
      )}

      <Section title="Basics">
        <TextField
          label="Job title"
          disabled={locked}
          error={errors.title?.message}
          {...register('title')}
        />
        <Select
          label="Job type"
          placeholder="Choose the type of job"
          disabled={locked}
          options={Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => ({ value, label }))}
          error={errors.employment_type?.message}
          {...register('employment_type')}
        />
        <fieldset className="space-y-1" disabled={locked}>
          <legend className="mb-1 text-sm font-semibold">Where the work is done</legend>
          {Object.entries(ARRANGEMENT_LABELS).map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                value={value}
                className="size-4.5 accent-primary"
                {...register('work_arrangement')}
              />
              {label}
            </label>
          ))}
          {errors.work_arrangement?.message && (
            <FormError>{errors.work_arrangement.message}</FormError>
          )}
        </fieldset>
        <Select
          label="District"
          placeholder="Choose a district"
          hint={
            arrangement === 'remote'
              ? 'Optional for remote jobs.'
              : 'Only remote jobs can leave this out.'
          }
          disabled={locked}
          options={districts.map((district) => ({ value: district.id, label: district.name }))}
          error={errors.district_id?.message}
          {...register('district_id')}
        />
        <div>
          <TextArea
            label="About the job"
            rows={8}
            error={errors.description?.message}
            {...register('description')}
          />
          <p className="text-right text-sm text-text-secondary">
            {description.length} of {DESCRIPTION_MAX}
          </p>
        </div>
      </Section>

      <Section title="Pay and experience">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Lowest pay (UGX)"
            inputMode="numeric"
            error={errors.salary_min?.message}
            {...register('salary_min')}
          />
          <TextField
            label="Highest pay (UGX)"
            inputMode="numeric"
            error={errors.salary_max?.message}
            {...register('salary_max')}
          />
        </div>
        <Checkbox label="Show the pay on the vacancy" {...register('show_salary')} />
        <Select
          label="Lowest qualification"
          placeholder="No minimum"
          options={levels.map((level) => ({ value: level.id, label: level.name }))}
          error={errors.min_qualification_level_id?.message}
          {...register('min_qualification_level_id')}
        />
        <TextField
          label="Years of experience"
          inputMode="numeric"
          error={errors.min_experience_years?.message}
          {...register('min_experience_years')}
        />
      </Section>

      <Section title="Requirements">
        <RequirementsEditor form={form} error={requirementsError ?? errors.root?.message} />
      </Section>

      <Section title="How people apply">
        <fieldset className="space-y-2" disabled={locked}>
          <legend className="mb-1 text-sm font-semibold">Applications</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <input
              type="radio"
              value="internal"
              className="size-4.5 accent-primary"
              {...register('application_method')}
            />
            On this site (recommended)
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <input
              type="radio"
              value="external"
              className="size-4.5 accent-primary"
              {...register('application_method')}
            />
            On another website
          </label>
        </fieldset>
        {method === 'external' && (
          <TextField
            label="Link where people apply"
            inputMode="url"
            placeholder="https://"
            hint="People leave this site to apply, so applications are not tracked here."
            disabled={locked}
            error={errors.external_url?.message}
            {...register('external_url')}
          />
        )}
      </Section>

      <Section title="Closing date">
        <TextField
          label="Applications close on"
          type="date"
          min={range.min}
          max={range.max}
          hint={`Pick a date up to ${formatDate(`${range.max}T12:00:00+03:00`)}. It closes at the end of that day.`}
          error={errors.closing_date?.message}
          {...register('closing_date')}
        />
      </Section>
    </div>
  )
}
