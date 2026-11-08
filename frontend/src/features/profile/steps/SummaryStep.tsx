import type { UseFormReturn } from 'react-hook-form'
import type { District, FieldOfStudy, Institution, QualificationLevel } from '../../../api/types'
import { Card } from '../../../components/Card'
import { TextArea } from '../../../components/TextArea'
import { formatDate } from '../../../lib/dates'
import { OTHER, SUMMARY_MAX, type ProfileFormValues, type StepId } from '../schema'

export interface SummaryStepProps {
  form: UseFormReturn<ProfileFormValues>
  districts: District[]
  levels: QualificationLevel[]
  institutions: Institution[]
  fields: FieldOfStudy[]
  onEdit: (step: StepId) => void
}

function EditLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-2 min-h-11 cursor-pointer rounded text-sm font-semibold text-primary underline"
    >
      {label}
    </button>
  )
}

export function SummaryStep({
  form,
  districts,
  levels,
  institutions,
  fields,
  onEdit,
}: SummaryStepProps) {
  const values = form.watch()
  const summaryLength = values.summary.length

  const institution =
    values.institution_id === OTHER
      ? `Other: ${values.institution_other_name.trim()}`
      : (institutions.find((item) => item.id === values.institution_id)?.name ?? '')
  const level = levels.find((item) => item.id === values.qualification_level_id)?.name ?? ''
  const field =
    values.field_of_study_id === OTHER
      ? values.field_of_study_other.trim()
      : (fields.find((item) => item.id === values.field_of_study_id)?.name ?? '')
  const district = districts.find((item) => item.id === values.district_id)?.name ?? ''
  const date =
    values.study_status === 'completed'
      ? values.graduation_date && `Completed ${formatDate(values.graduation_date)}`
      : values.expected_completion_date && `Expected ${formatDate(values.expected_completion_date)}`

  return (
    <div className="space-y-5">
      <div>
        <TextArea
          label="About you (optional)"
          hint="Two or three sentences about what you are looking for."
          error={form.formState.errors.summary?.message}
          {...form.register('summary')}
        />
        <p className="text-right text-sm text-text-secondary">
          {summaryLength} of {SUMMARY_MAX}
        </p>
      </div>

      <section aria-labelledby="review-title">
        <h2 id="review-title" className="mb-2 text-title-sm font-semibold">
          Review
        </h2>
        <Card as="dl" className="space-y-3">
          <div>
            <dt className="text-sm text-text-secondary">
              Name <EditLink label="Edit name" onClick={() => onEdit('basics')} />
            </dt>
            <dd className="font-semibold">
              {values.full_name.trim()}
              {values.phone.trim() && ` · ${values.phone.trim()}`}
              {district && ` · ${district}`}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-text-secondary">
              Education <EditLink label="Edit education" onClick={() => onEdit('education')} />
            </dt>
            <dd className="font-semibold">
              {[level, field, institution, date].filter(Boolean).join(' · ')}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-text-secondary">
              Skills <EditLink label="Edit skills" onClick={() => onEdit('skills')} />
            </dt>
            <dd className="font-semibold">
              {values.skills.length > 0
                ? values.skills.map((skill) => skill.name).join(', ')
                : 'None added yet'}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-text-secondary">
              Experience <EditLink label="Edit experience" onClick={() => onEdit('experience')} />
            </dt>
            <dd className="font-semibold">
              {values.experiences.length > 0
                ? values.experiences
                    .map((entry) => `${entry.title.trim()}, ${entry.organisation.trim()}`)
                    .join('; ')
                : 'None added yet'}
            </dd>
          </div>
        </Card>
      </section>
    </div>
  )
}
