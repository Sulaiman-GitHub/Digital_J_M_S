import type {
  ApplicationDetail,
  ApplicationItem,
  ApplicationStatus,
  ApplicationHistoryItem,
  ProfileSnapshot,
} from '../../api/types'

export const snapshot: ProfileSnapshot = {
  full_name: 'Nakato Sarah',
  phone: '+256772123456',
  institution: 'Gulu University',
  qualification: "Bachelor's degree",
  field_of_study: 'Accounting',
  study_status: 'completed',
  expected_completion_date: null,
  graduation_date: '2025-07-15',
  district: 'Gulu',
  summary: 'Recent accounting graduate.',
  skills: ['Excel', 'Python'],
  experiences: [
    {
      title: 'Accounts Intern',
      organisation: 'Ssese Fresh Foods Ltd',
      start_date: '2024-01-08',
      end_date: '2024-06-28',
      description: 'Recorded supplier invoices.',
    },
  ],
}

export function makeHistory(...steps: [ApplicationStatus, string, string?][]) {
  let previous: ApplicationStatus | null = null
  return steps.map(([status, at, note]): ApplicationHistoryItem => {
    const item: ApplicationHistoryItem = {
      from_status: previous,
      to_status: status,
      by: previous === null ? 'applicant' : 'employer',
      note: note ?? null,
      created_at: at,
    }
    previous = status
    return item
  })
}

export function makeItem(overrides: Partial<ApplicationItem> = {}): ApplicationItem {
  return {
    id: 'a1',
    status: 'submitted',
    submitted_at: '2026-11-04T09:02:00Z',
    updated_at: '2026-11-04T09:02:00Z',
    vacancy: {
      id: 'v1',
      title: 'Accounts Assistant',
      company_name: 'Ssese Foods Ltd',
      status: 'published',
      is_live: true,
    },
    ...overrides,
  }
}

export function makeApplication(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    ...makeItem(),
    cover_note: 'I finished my accounting degree in July.',
    profile: snapshot,
    cv: {
      original_filename: 'nakato-cv.pdf',
      content_type: 'application/pdf',
      size_bytes: 245_760,
    },
    applicant_email: null,
    next_statuses: ['withdrawn'],
    history: makeHistory(['submitted', '2026-11-04T09:02:00Z']),
    ...overrides,
  }
}
