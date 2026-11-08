import { useId } from 'react'
import type { District, EmploymentType, QualificationLevel, WorkArrangement } from '../../api/types'
import type { VacancyFilters } from '../../api/vacancies'
import { Select } from '../../components/Select'
import { ARRANGEMENT_LABELS, EMPLOYMENT_LABELS } from './format'

interface Choice<T extends string> {
  value: T
  label: string
}

export function RadioGroup<T extends string>({
  legend,
  choices,
  value,
  onChange,
  anyLabel = 'Any',
}: {
  legend: string
  choices: Choice<T>[]
  value: T | undefined
  onChange: (value: T | undefined) => void
  anyLabel?: string
}) {
  const name = useId()
  const options: Choice<T | ''>[] = [{ value: '', label: anyLabel }, ...choices]
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2.5">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={(value ?? '') === option.value}
            onChange={() => onChange(option.value === '' ? undefined : option.value)}
            className="size-4.5 accent-primary"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

export interface JobFiltersProps {
  value: VacancyFilters
  onChange: (next: VacancyFilters) => void
  districts: District[]
  levels: QualificationLevel[]
}

/** The filter controls. The same form is the desktop sidebar and the phone sheet (mockup S2). */
export function JobFilters({ value, onChange, districts, levels }: JobFiltersProps) {
  const set = (patch: Partial<VacancyFilters>) => onChange({ ...value, ...patch })
  return (
    <div className="space-y-5">
      <Select
        label="District"
        placeholder="All districts"
        options={districts.map((district) => ({ value: district.id, label: district.name }))}
        value={value.district_id ?? ''}
        onChange={(event) => set({ district_id: event.target.value || undefined })}
      />
      <RadioGroup<EmploymentType>
        legend="Job type"
        choices={(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((key) => ({
          value: key,
          label: EMPLOYMENT_LABELS[key],
        }))}
        value={value.employment_type}
        onChange={(employment_type) => set({ employment_type })}
      />
      <RadioGroup<WorkArrangement>
        legend="Where you work"
        choices={(Object.keys(ARRANGEMENT_LABELS) as WorkArrangement[]).map((key) => ({
          value: key,
          label: ARRANGEMENT_LABELS[key],
        }))}
        value={value.work_arrangement}
        onChange={(work_arrangement) => set({ work_arrangement })}
      />
      {levels.length > 0 && (
        <RadioGroup<string>
          legend="Your qualification"
          anyLabel="Any"
          choices={levels.map((level) => ({ value: level.id, label: level.name }))}
          value={value.qualification_level_id}
          onChange={(qualification_level_id) => set({ qualification_level_id })}
        />
      )}
    </div>
  )
}
