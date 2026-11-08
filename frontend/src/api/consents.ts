import { apiGet, apiPost } from './client'
import type { Consent, ConsentType, DataResponse } from './types'

/** The consents that are active now. */
export async function fetchConsents(signal?: AbortSignal): Promise<Consent[]> {
  return (await apiGet<DataResponse<Consent[]>>('/api/v1/consents/me', { signal })).data
}

/** Give (granted: true) or withdraw a consent. Returns the consents that are active after. */
export async function setConsent(consentType: ConsentType, granted: boolean): Promise<Consent[]> {
  return (
    await apiPost<DataResponse<Consent[]>>('/api/v1/consents', {
      consent_type: consentType,
      granted,
    })
  ).data
}
