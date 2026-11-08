import { useState } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { MultiSelect } from '../../../components/MultiSelect'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { MAX_SKILLS, type ProfileFormValues } from '../schema'
import { useSkillSearch } from '../useProfileData'

export interface SkillsStepProps {
  form: UseFormReturn<ProfileFormValues>
}

export function SkillsStep({ form }: SkillsStepProps) {
  const [query, setQuery] = useState('')
  const search = useSkillSearch(useDebouncedValue(query.trim(), 250))

  return (
    <div className="space-y-2">
      <Controller
        control={form.control}
        name="skills"
        render={({ field }) => (
          <MultiSelect
            label="Add skills"
            noun="skills"
            hint={`Search and pick from the list. Up to ${MAX_SKILLS}.`}
            placeholder="e.g. Microsoft Excel"
            selected={field.value}
            onChange={field.onChange}
            results={search.data ?? []}
            onQueryChange={setQuery}
            loading={search.isFetching}
            max={MAX_SKILLS}
            error={form.formState.errors.skills?.message}
          />
        )}
      />
      {search.isError && (
        <p role="status" className="text-sm text-danger">
          Could not load suggestions. Check your connection and try typing again.
        </p>
      )}
    </div>
  )
}
