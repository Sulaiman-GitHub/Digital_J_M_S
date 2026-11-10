import type { UseFormReturn } from 'react-hook-form'
import type { District } from '../../../api/types'
import { Select } from '../../../components/Select'
import { TextField } from '../../../components/TextField'
import type { ProfileFormValues } from '../schema'

export interface BasicsStepProps {
  form: UseFormReturn<ProfileFormValues>
  districts: District[]
}

export function BasicsStep({ form, districts }: BasicsStepProps) {
  const {
    register,
    formState: { errors },
  } = form
  return (
    <div className="space-y-4">
      <TextField
        label="Full name"
        autoComplete="name"
        error={errors.full_name?.message}
        {...register('full_name')}
      />
      <TextField
        label="Phone number (optional)"
        hint="Ugandan mobile number, e.g. 0772 123456"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        label="Date of birth (optional)"
        hint="Private. Employers never see it. You must be 16 or older."
        type="date"
        className="max-w-xs"
        autoComplete="bday"
        error={errors.date_of_birth?.message}
        {...register('date_of_birth')}
      />
      <Select
        label="District where you live"
        placeholder="Choose your district"
        options={districts.map((district) => ({ value: district.id, label: district.name }))}
        error={errors.district_id?.message}
        {...register('district_id')}
      />
    </div>
  )
}
