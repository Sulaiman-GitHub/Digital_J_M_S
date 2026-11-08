import { apiGet } from './client'
import type {
  DataResponse,
  District,
  FieldOfStudy,
  Institution,
  QualificationLevel,
  Skill,
} from './types'

const REFERENCE = '/api/v1/reference'

// The server marks these lists cacheable (Cache-Control + ETag), so the browser itself avoids
// downloading them again.
export async function fetchDistricts(signal?: AbortSignal): Promise<District[]> {
  return (await apiGet<DataResponse<District[]>>(`${REFERENCE}/districts`, { signal })).data
}

export async function fetchQualificationLevels(
  signal?: AbortSignal,
): Promise<QualificationLevel[]> {
  return (
    await apiGet<DataResponse<QualificationLevel[]>>(`${REFERENCE}/qualification-levels`, {
      signal,
    })
  ).data
}

export async function fetchInstitutions(signal?: AbortSignal): Promise<Institution[]> {
  return (await apiGet<DataResponse<Institution[]>>(`${REFERENCE}/institutions`, { signal })).data
}

export async function fetchFieldsOfStudy(signal?: AbortSignal): Promise<FieldOfStudy[]> {
  return (await apiGet<DataResponse<FieldOfStudy[]>>(`${REFERENCE}/fields-of-study`, { signal }))
    .data
}

/** Skill autocomplete: at most 20, names starting with the text first. */
export async function searchSkills(query: string, signal?: AbortSignal): Promise<Skill[]> {
  const path = `${REFERENCE}/skills?q=${encodeURIComponent(query)}`
  return (await apiGet<DataResponse<Skill[]>>(path, { signal })).data
}
