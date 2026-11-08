import type { EmploymentType, QualificationLevel, WorkArrangement } from '../../api/types'
import type { VacancyFilters } from '../../api/vacancies'
import { FilterChip } from '../../components/FilterChip'
import { ARRANGEMENT_LABELS, EMPLOYMENT_LABELS } from './format'
import { RadioGroup } from './JobFilters'

export interface JobFilterChipsProps {
  value: VacancyFilters
  onChange: (next: VacancyFilters) => void
  levels: QualificationLevel[]
}

/** The desktop filter row: one chip per filter, each opening a short list (like Indeed). */
export function JobFilterChips({ value, onChange, levels }: JobFilterChipsProps) {
  const levelName = levels.find((level) => level.id === value.qualification_level_id)?.name
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip
        label="Job type"
        value={value.employment_type ? EMPLOYMENT_LABELS[value.employment_type] : undefined}
      >
        {(close) => (
          <RadioGroup<EmploymentType>
            legend="Job type"
            choices={(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((key) => ({
              value: key,
              label: EMPLOYMENT_LABELS[key],
            }))}
            value={value.employment_type}
            onChange={(employment_type) => {
              onChange({ ...value, employment_type })
              close()
            }}
          />
        )}
      </FilterChip>
      <FilterChip
        label="Where you work"
        value={value.work_arrangement ? ARRANGEMENT_LABELS[value.work_arrangement] : undefined}
      >
        {(close) => (
          <RadioGroup<WorkArrangement>
            legend="Where you work"
            choices={(Object.keys(ARRANGEMENT_LABELS) as WorkArrangement[]).map((key) => ({
              value: key,
              label: ARRANGEMENT_LABELS[key],
            }))}
            value={value.work_arrangement}
            onChange={(work_arrangement) => {
              onChange({ ...value, work_arrangement })
              close()
            }}
          />
        )}
      </FilterChip>
      {levels.length > 0 && (
        <FilterChip label="Qualification" value={levelName}>
          {(close) => (
            <RadioGroup<string>
              legend="Your qualification"
              choices={levels.map((level) => ({ value: level.id, label: level.name }))}
              value={value.qualification_level_id}
              onChange={(qualification_level_id) => {
                onChange({ ...value, qualification_level_id })
                close()
              }}
            />
          )}
        </FilterChip>
      )}
    </div>
  )
}
