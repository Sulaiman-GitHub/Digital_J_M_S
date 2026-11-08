import { Controller, type UseFormReturn } from 'react-hook-form'
import type { FieldOfStudy, Institution, QualificationLevel } from '../../../api/types'
import { Button } from '../../../components/Button'
import { Combobox } from '../../../components/Combobox'
import { Select } from '../../../components/Select'
import { TextField } from '../../../components/TextField'
import { OTHER, type ProfileFormValues } from '../schema'

export interface EducationStepProps {
  form: UseFormReturn<ProfileFormValues>
  institutions: Institution[]
  levels: QualificationLevel[]
  fields: FieldOfStudy[]
}

const OTHER_INSTITUTION = { value: OTHER, label: 'Other (type its name)' }
const OTHER_FIELD = { value: OTHER, label: 'Other (type it)' }

const STATUS_OPTIONS = [
  { value: 'studying', label: 'Still studying' },
  { value: 'completed', label: 'Completed' },
] as const

export function EducationStep({ form, institutions, levels, fields }: EducationStepProps) {
  const {
    control,
    register,
    setValue,
    watch,
    formState: { errors },
  } = form
  const institutionId = watch('institution_id')
  const fieldId = watch('field_of_study_id')
  const status = watch('study_status')

  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="institution_id"
        render={({ field }) => (
          <Combobox
            label="Institution"
            placeholder="Search your institution"
            options={[
              ...institutions.map((item) => ({ value: item.id, label: item.name })),
              OTHER_INSTITUTION,
            ]}
            value={field.value || null}
            onChange={(value) => field.onChange(value ?? '')}
            error={errors.institution_id?.message}
          />
        )}
      />
      {institutionId === OTHER && (
        <TextField
          label="Institution name"
          placeholder="e.g. Kabale Hills Institute"
          error={errors.institution_other_name?.message}
          {...register('institution_other_name')}
        />
      )}

      <Select
        label="Qualification"
        placeholder="Choose your qualification"
        options={levels.map((level) => ({ value: level.id, label: level.name }))}
        error={errors.qualification_level_id?.message}
        {...register('qualification_level_id')}
      />

      <div className="space-y-2">
        <Controller
          control={control}
          name="field_of_study_id"
          render={({ field }) => (
            <Combobox
              label="Field of study (optional)"
              placeholder="Search your field of study"
              options={[
                ...fields.map((item) => ({ value: item.id, label: item.name })),
                OTHER_FIELD,
              ]}
              value={field.value || null}
              onChange={(value) => field.onChange(value ?? '')}
              error={errors.field_of_study_id?.message}
            />
          )}
        />
        {fieldId === OTHER && (
          <TextField
            label="Your field of study"
            error={errors.field_of_study_other?.message}
            {...register('field_of_study_other')}
          />
        )}
        {fieldId && (
          <Button
            variant="ghost"
            onClick={() => {
              setValue('field_of_study_id', '', { shouldDirty: true })
              setValue('field_of_study_other', '', { shouldDirty: true })
            }}
          >
            Clear field of study
          </Button>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Where are you with this course?</legend>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-card border border-text-secondary p-3 has-checked:border-2 has-checked:border-primary has-checked:bg-primary-tint has-checked:font-semibold"
            >
              <input
                type="radio"
                value={option.value}
                className="size-4.5 accent-primary"
                {...register('study_status', {
                  // Only the date that fits the status is kept.
                  onChange: (event) => {
                    if (event.target.value === 'studying') {
                      setValue('graduation_date', '', { shouldDirty: true })
                    } else {
                      setValue('expected_completion_date', '', { shouldDirty: true })
                    }
                  },
                })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {status === 'studying' ? (
        <TextField
          label="Expected completion date (optional)"
          type="date"
          className="max-w-xs"
          error={errors.expected_completion_date?.message}
          {...register('expected_completion_date')}
        />
      ) : (
        <TextField
          label="Graduation date (optional)"
          type="date"
          className="max-w-xs"
          error={errors.graduation_date?.message}
          {...register('graduation_date')}
        />
      )}
    </div>
  )
}
