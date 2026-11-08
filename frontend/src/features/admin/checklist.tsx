import type { ReactNode } from 'react'
import type { AdminEmployerDetail } from '../../api/types'

interface Item {
  label: string
  present: boolean
  help: ReactNode
}

/** What the employer provided, item by item. It never says the details are true. */
export function checklistItems(employer: AdminEmployerDetail): Item[] {
  const contact = employer.contact_phone ?? employer.website
  return [
    {
      label: 'Company name',
      present: employer.company_name.trim() !== '',
      help: `${employer.company_name}. Does it match the registration?`,
    },
    {
      label: 'Registration details',
      present: Boolean(employer.registration_number),
      help: employer.registration_number
        ? `${employer.registration_number}. Look it up with the registrar.`
        : 'Missing. The employer cannot submit without it.',
    },
    {
      label: 'Named contact',
      present: employer.owner.email !== '',
      help: `${employer.owner.email} (${
        employer.owner.email_verified ? 'email verified' : 'email not verified'
      }).`,
    },
    {
      label: 'Working phone or website',
      present: Boolean(contact),
      help: contact
        ? [employer.contact_phone, employer.website].filter(Boolean).join(' · ')
        : 'Missing. The employer cannot submit without one.',
    },
  ]
}
