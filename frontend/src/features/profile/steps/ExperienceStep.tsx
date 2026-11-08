import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { Button } from '../../../components/Button'
import { Checkbox } from '../../../components/Checkbox'
import { TextArea } from '../../../components/TextArea'
import { TextField } from '../../../components/TextField'
import {
  DESCRIPTION_MAX,
  MAX_EXPERIENCES,
  emptyExperience,
  type ProfileFormValues,
} from '../schema'

export interface ExperienceStepProps {
  form: UseFormReturn<ProfileFormValues>
}

export function ExperienceStep({ form }: ExperienceStepProps) {
  const {
    control,
    register,
    setValue,
    watch,
    formState: { errors },
  } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'experiences' })
  const entries = watch('experiences')
  const arrayError = errors.experiences?.message ?? errors.experiences?.root?.message

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Internships, volunteering and part-time work count too. Up to {MAX_EXPERIENCES}.
      </p>

      {fields.map((entry, index) => {
        const entryErrors = errors.experiences?.[index]
        const current = entries[index]?.current ?? false
        const descriptionLength = entries[index]?.description?.length ?? 0
        return (
          <fieldset key={entry.id} className="space-y-4 rounded-card border border-border p-4">
            <legend className="sr-only">Experience {index + 1}</legend>
            <div className="flex items-center justify-between font-semibold" aria-hidden="true">
              <span>Experience {index + 1}</span>
            </div>
            <TextField
              label="Job title"
              error={entryErrors?.title?.message}
              {...register(`experiences.${index}.title`)}
            />
            <TextField
              label="Organisation"
              error={entryErrors?.organisation?.message}
              {...register(`experiences.${index}.organisation`)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Start date"
                type="date"
                error={entryErrors?.start_date?.message}
                {...register(`experiences.${index}.start_date`)}
              />
              <TextField
                label="End date"
                type="date"
                disabled={current}
                error={entryErrors?.end_date?.message}
                {...register(`experiences.${index}.end_date`)}
              />
            </div>
            <Checkbox
              label="I still work here"
              {...register(`experiences.${index}.current`, {
                onChange: (event) => {
                  if (event.target.checked) {
                    setValue(`experiences.${index}.end_date`, '', { shouldDirty: true })
                  }
                },
              })}
            />
            <div>
              <TextArea
                label="What did you do? (optional)"
                error={entryErrors?.description?.message}
                {...register(`experiences.${index}.description`)}
              />
              <p className="text-right text-sm text-text-secondary">
                {descriptionLength} of {DESCRIPTION_MAX}
              </p>
            </div>
            <Button variant="ghost" className="text-danger" onClick={() => remove(index)}>
              Remove experience {index + 1}
            </Button>
          </fieldset>
        )
      })}

      {arrayError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {arrayError}
        </p>
      )}
      <Button
        variant="secondary"
        fullWidth
        disabled={fields.length >= MAX_EXPERIENCES}
        onClick={() => append(emptyExperience())}
      >
        {fields.length === 0 ? '+ Add an experience' : '+ Add another experience'}
      </Button>
      {fields.length >= MAX_EXPERIENCES && (
        <p className="text-sm text-text-secondary">
          You have added the maximum of {MAX_EXPERIENCES} experiences.
        </p>
      )}
    </div>
  )
}
