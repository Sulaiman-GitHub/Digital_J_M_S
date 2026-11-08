import { useState } from 'react'
import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { Button } from '../../../components/Button'
import { FormError } from '../../../components/FormError'
import { MultiSelect } from '../../../components/MultiSelect'
import { Select } from '../../../components/Select'
import { TextField } from '../../../components/TextField'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { useSkillSearch } from '../../profile/useProfileData'
import {
  MAX_REQUIREMENTS,
  type OtherKind,
  type SkillRequirementValue,
  type VacancyFormValues,
} from './vacancySchema'

const KIND_LABELS: Record<OtherKind, string> = {
  qualification: 'Qualification',
  certification: 'Certification',
  other: 'Other',
}

function RequiredToggle({
  checked,
  onChange,
  name,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  name: string
}) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={`${name}: required`}
        className="size-4.5 accent-primary"
      />
      Required
    </label>
  )
}

export interface RequirementsEditorProps {
  form: UseFormReturn<VacancyFormValues>
  error?: string
}

/**
 * Skills are searched and picked; each has a Required toggle (otherwise it is "preferred").
 * Qualifications, certifications and anything else are typed. Twenty requirements at most.
 */
export function RequirementsEditor({ form, error }: RequirementsEditorProps) {
  const [query, setQuery] = useState('')
  const search = useSkillSearch(useDebouncedValue(query.trim(), 250))
  const others = useFieldArray({ control: form.control, name: 'others' })
  const skills = form.watch('skills')
  const total = skills.length + others.fields.length
  const room = MAX_REQUIREMENTS - others.fields.length

  function pickSkills(items: { id: string; name: string }[]) {
    const kept = new Map(skills.map((skill) => [skill.id, skill]))
    const next: SkillRequirementValue[] = items.map(
      (item) => kept.get(item.id) ?? { id: item.id, name: item.name, is_mandatory: false },
    )
    form.setValue('skills', next, { shouldDirty: true, shouldValidate: true })
  }

  function toggleSkill(id: string, is_mandatory: boolean) {
    form.setValue(
      'skills',
      skills.map((skill) => (skill.id === id ? { ...skill, is_mandatory } : skill)),
      { shouldDirty: true },
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <MultiSelect
          label="Skills"
          noun="skills"
          hint="Search and pick from the list."
          placeholder="e.g. Microsoft Excel"
          selected={skills}
          onChange={pickSkills}
          results={search.data ?? []}
          onQueryChange={setQuery}
          loading={search.isFetching}
          max={room}
        />
        {skills.length > 0 && (
          <ul aria-label="Skill requirements" className="divide-y divide-border">
            {skills.map((skill) => (
              <li key={skill.id} className="flex items-center justify-between gap-2 py-1">
                <span className="font-semibold">{skill.name}</span>
                <RequiredToggle
                  name={skill.name}
                  checked={skill.is_mandatory}
                  onChange={(value) => toggleSkill(skill.id, value)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Other requirements</h3>
        {others.fields.map((field, index) => {
          const fieldErrors = form.formState.errors.others?.[index]
          const label = form.watch(`others.${index}.label`) || `Requirement ${index + 1}`
          return (
            <div key={field.id} className="space-y-2 rounded-card border border-border p-3">
              <Select
                label="Type"
                options={(Object.keys(KIND_LABELS) as OtherKind[]).map((kind) => ({
                  value: kind,
                  label: KIND_LABELS[kind],
                }))}
                {...form.register(`others.${index}.kind`)}
              />
              <TextField
                label="Requirement"
                error={fieldErrors?.label?.message}
                {...form.register(`others.${index}.label`)}
              />
              <div className="flex items-center justify-between gap-2">
                <RequiredToggle
                  name={label}
                  checked={form.watch(`others.${index}.is_mandatory`)}
                  onChange={(value) =>
                    form.setValue(`others.${index}.is_mandatory`, value, { shouldDirty: true })
                  }
                />
                <Button variant="ghost" onClick={() => others.remove(index)}>
                  {`Remove ${label}`}
                </Button>
              </div>
            </div>
          )
        })}
        <Button
          variant="secondary"
          disabled={total >= MAX_REQUIREMENTS}
          onClick={() => others.append({ kind: 'qualification', label: '', is_mandatory: false })}
        >
          Add a requirement
        </Button>
        <p className="text-sm text-text-secondary">
          {total} of {MAX_REQUIREMENTS} requirements.
        </p>
        {error && <FormError>{error}</FormError>}
      </div>
    </div>
  )
}
