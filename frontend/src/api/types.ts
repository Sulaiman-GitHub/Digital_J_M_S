// Shared API types. Field names match the backend JSON exactly (snake_case).

import type { ApplicationStatus } from '../lib/applicationStatus'

export type ErrorDetails = Record<string, unknown> | null

export interface ErrorEnvelope {
  error: {
    code: string
    message: string
    details: ErrorDetails
  }
}

export interface DataResponse<T> {
  data: T
}

export interface PageMeta {
  page: number
  page_size: number
  total: number
}

export interface PagedResponse<T> {
  data: T[]
  meta: PageMeta
}

/** Error thrown by the API client for every failed request. */
export class ApiError extends Error {
  readonly code: string
  readonly details: ErrorDetails
  readonly status: number

  constructor(code: string, message: string, details: ErrorDetails, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    this.status = status
  }
}

export type UserRole = 'job_seeker' | 'employer' | 'admin'
export type UserStatus = 'active' | 'suspended' | 'deleted'

/** Matches the backend UserOut schema exactly. */
export interface User {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  email_verified: boolean
  /** Filled in Phase 3 (employer profiles); null until then. */
  employer_status: string | null
  created_at: string
}

export interface MessageData {
  message: string
}

// ---------- reference data (GET /api/v1/reference/*) ----------

export interface District {
  id: string
  name: string
  region: string
}

export interface QualificationLevel {
  id: string
  name: string
  rank: number
}

export type InstitutionType =
  'university' | 'college' | 'technical_institute' | 'vocational' | 'other'

export interface Institution {
  id: string
  name: string
  institution_type: InstitutionType
  district_id: string | null
}

export interface FieldOfStudy {
  id: string
  name: string
}

export interface Skill {
  id: string
  name: string
}

// ---------- seeker profile (GET and PUT /api/v1/profile/me) ----------

export type StudyStatus = 'studying' | 'completed'

export interface ProfileExperience {
  id: string
  title: string
  organisation: string
  start_date: string
  end_date: string | null
  description: string | null
}

/** Matches the backend ProfileOut schema exactly. */
export interface Profile {
  id: string
  full_name: string
  phone: string | null
  institution_id: string | null
  institution_other_name: string | null
  qualification_level_id: string
  field_of_study_id: string | null
  field_of_study_other: string | null
  study_status: StudyStatus
  expected_completion_date: string | null
  graduation_date: string | null
  district_id: string
  summary: string | null
  skills: Skill[]
  experiences: ProfileExperience[]
  created_at: string
  updated_at: string
}

export interface ExperienceInput {
  title: string
  organisation: string
  start_date: string
  end_date: string | null
  description: string | null
}

/** Matches the backend ProfileIn schema exactly (PUT replaces the whole profile). */
export interface ProfileInput {
  full_name: string
  phone: string | null
  institution_id: string | null
  institution_other_name: string | null
  qualification_level_id: string
  field_of_study_id: string | null
  field_of_study_other: string | null
  study_status: StudyStatus
  expected_completion_date: string | null
  graduation_date: string | null
  district_id: string
  summary: string | null
  skill_ids: string[]
  experiences: ExperienceInput[]
}

/** Details of a profile photo or company logo (never the file itself). */
export interface Picture {
  content_type: string
  size_bytes: number
  created_at: string
}

export interface Cv {
  id: string
  original_filename: string
  content_type: string
  size_bytes: number
  created_at: string
}

export type ConsentType = 'terms' | 'privacy' | 'cv_sharing_with_employers'

export interface Consent {
  consent_type: ConsentType
  policy_version: string
  granted_at: string
}

export type VerificationStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended'

export interface Employer {
  id: string
  company_name: string
  registration_number: string | null
  website: string | null
  contact_phone: string | null
  district_id: string
  description: string | null
  verification_status: VerificationStatus
  /** Why the current rejection or suspension happened; null in any other status. */
  status_reason: string | null
  can_publish: boolean
  submitted_at: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

/** Matches the backend EmployerIn schema (PUT replaces the editable fields). */
export interface EmployerInput {
  company_name: string
  registration_number: string | null
  website: string | null
  contact_phone: string | null
  district_id: string
  description: string | null
}

export interface PageMeta {
  page: number
  page_size: number
  total: number
}

export interface PagedResponse<T> {
  data: T[]
  meta: PageMeta
}

export interface AdminEmployerItem {
  id: string
  company_name: string
  owner_email: string
  district_name: string
  verification_status: VerificationStatus
  submitted_at: string | null
  decided_at: string | null
}

export interface VerificationEvent {
  id: string
  from_status: VerificationStatus
  to_status: VerificationStatus
  actor_email: string | null
  reason: string | null
  created_at: string
}

export interface AdminEmployerDetail {
  id: string
  owner: { id: string; email: string; email_verified: boolean }
  company_name: string
  registration_number: string | null
  website: string | null
  contact_phone: string | null
  district_id: string
  district_name: string
  description: string | null
  verification_status: VerificationStatus
  submitted_at: string | null
  decided_at: string | null
  created_at: string
  /** Oldest first. */
  history: VerificationEvent[]
}

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary'
export type WorkArrangement = 'onsite' | 'remote' | 'hybrid'
export type ApplicationMethod = 'internal' | 'external'
export type RequirementKind = 'skill' | 'qualification' | 'certification' | 'other'

/** A vacancy as the public list shows it (card-sized). */
export interface VacancyCard {
  id: string
  title: string
  company_name: string
  /** Address of the company logo, or null/absent when it has none. */
  company_logo_url?: string | null
  district_id: string | null
  district_name: string | null
  employment_type: EmploymentType
  work_arrangement: WorkArrangement
  published_at: string
  expires_at: string
  /** Null unless the employer chose to show the salary. */
  salary_min: number | null
  salary_max: number | null
}

export interface VacancyRequirement {
  id: string
  kind: RequirementKind
  skill_id: string | null
  label: string
  is_mandatory: boolean
}

export interface VacancyDetail {
  id: string
  title: string
  description: string
  employment_type: EmploymentType
  work_arrangement: WorkArrangement
  district_id: string | null
  district_name: string | null
  min_qualification_level_id: string | null
  min_qualification_level_name: string | null
  min_experience_years: number
  salary_min: number | null
  salary_max: number | null
  application_method: ApplicationMethod
  /** Where to apply for an external vacancy; null for internal ones. */
  external_url: string | null
  published_at: string
  expires_at: string
  requirements: VacancyRequirement[]
  employer: { company_name: string; district_name: string | null; logo_url?: string | null }
}

export type VacancyStatus = 'draft' | 'published' | 'closed'

/** A vacancy as its employer (or an admin) sees it: any status, with every field. */
export interface ManagedVacancy {
  id: string
  employer_id: string
  title: string
  description: string | null
  employment_type: EmploymentType | null
  work_arrangement: WorkArrangement | null
  district_id: string | null
  min_qualification_level_id: string | null
  min_experience_years: number
  salary_min: number | null
  salary_max: number | null
  show_salary: boolean
  application_method: ApplicationMethod
  external_url: string | null
  status: VacancyStatus
  published_at: string | null
  expires_at: string | null
  /** Published and not yet expired. */
  is_live: boolean
  created_by_admin: boolean
  requirements: VacancyRequirement[]
  /** Applications received, and how many nobody has looked at yet. */
  application_count: number
  new_application_count: number
  created_at: string
  updated_at: string
}

export interface RequirementInput {
  kind: RequirementKind
  skill_id: string | null
  label: string | null
  is_mandatory: boolean
}

/** Matches the backend VacancyIn schema (PUT replaces the editable fields and requirements). */
export interface VacancyInput {
  title: string
  description: string | null
  employment_type: EmploymentType | null
  work_arrangement: WorkArrangement | null
  district_id: string | null
  min_qualification_level_id: string | null
  min_experience_years: number
  salary_min: number | null
  salary_max: number | null
  show_salary: boolean
  application_method: ApplicationMethod
  external_url: string | null
  expires_at: string | null
  requirements: RequirementInput[]
}

export type ReportReason =
  'scam_or_fee' | 'fake_employer' | 'misleading' | 'discriminatory' | 'other'
export type ReportStatus = 'open' | 'actioned' | 'dismissed'

export interface ReportInput {
  reason: ReportReason
  details: string | null
}

export interface ReportCreated {
  id: string
  status: ReportStatus
  created_at: string
}

export interface ReportedVacancy {
  id: string
  title: string
  description: string | null
  status: VacancyStatus
  is_live: boolean
  company_name: string
  employer_id: string
  employer_status: VerificationStatus
}

export interface AdminReport {
  id: string
  reason: ReportReason
  details: string | null
  status: ReportStatus
  created_at: string
  handled_at: string | null
  reporter_email: string | null
  vacancy: ReportedVacancy
  /** Reports about this vacancy that are still open. */
  open_reports_for_vacancy: number
}

export interface ResolveInput {
  action: 'dismiss' | 'action'
  note?: string | null
  suspend_employer?: boolean
}

// ---------- applications (Phase 5) ----------

export type { ApplicationStatus }

export interface ApplicationVacancy {
  id: string
  title: string
  company_name: string
  status: VacancyStatus
  /** Published and not past its closing date. */
  is_live: boolean
}

/** A row in the job seeker's own list. */
export interface ApplicationItem {
  id: string
  status: ApplicationStatus
  submitted_at: string
  updated_at: string
  vacancy: ApplicationVacancy
}

/** A row in an employer's list of applicants for one vacancy. */
export interface ApplicantItem {
  id: string
  status: ApplicationStatus
  submitted_at: string
  updated_at: string
  applicant_name: string
  applicant_email: string
  qualification: string | null
  institution: string | null
  has_cover_note: boolean
}

export interface ApplicationHistoryItem {
  from_status: ApplicationStatus | null
  to_status: ApplicationStatus
  by: 'applicant' | 'employer'
  note: string | null
  created_at: string
}

/** The profile as it was when the person applied (names, not ids). */
export interface ProfileSnapshot {
  full_name: string
  phone: string | null
  institution: string | null
  qualification: string | null
  field_of_study: string | null
  study_status: StudyStatus
  expected_completion_date: string | null
  graduation_date: string | null
  district: string | null
  summary: string | null
  skills: string[]
  experiences: {
    title: string
    organisation: string
    start_date: string
    end_date: string | null
    description: string | null
  }[]
}

export interface ApplicationDetail {
  id: string
  status: ApplicationStatus
  submitted_at: string
  updated_at: string
  cover_note: string | null
  vacancy: ApplicationVacancy
  profile: ProfileSnapshot
  cv: { original_filename: string; content_type: string; size_bytes: number }
  /** Only the vacancy's employer sees it. */
  applicant_email: string | null
  /** The statuses the person looking can move this application to. */
  next_statuses: ApplicationStatus[]
  /** Oldest first. */
  history: ApplicationHistoryItem[]
}

export interface ApplyInput {
  cover_note: string | null
}
