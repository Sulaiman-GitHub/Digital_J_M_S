import { describe, expect, it } from 'vitest'
import {
  companySchema,
  emptyCompany,
  fromEmployer,
  isUgandanPhone,
  isWebAddress,
  toPayload,
} from './companySchema'
import { KAMPALA, makeEmployer } from './testData'

const valid = { ...emptyCompany, company_name: 'Ssese Foods Ltd', district_id: KAMPALA }
const problems = (values: object) => {
  const result = companySchema.safeParse(values)
  return result.success
    ? []
    : [...new Set(result.error.issues.map((issue) => String(issue.path[0])))]
}

describe('companySchema', () => {
  it('needs only a name and a district', () => {
    expect(problems(valid)).toEqual([])
    expect(problems(emptyCompany).sort()).toEqual(['company_name', 'district_id'])
  })

  it.each([
    ['company_name', ' '],
    ['company_name', 'A'],
    ['company_name', 'x'.repeat(201)],
    ['registration_number', 'x'.repeat(51)],
    ['website', 'x'.repeat(301)],
    ['website', 'example.com'],
    ['contact_phone', 'abc'],
    ['description', 'x'.repeat(2001)],
  ])('refuses %s = %s…', (name, value) => {
    expect(problems({ ...valid, [name]: value })).toContain(name)
  })

  it('accepts the longest allowed values', () => {
    expect(
      problems({
        ...valid,
        company_name: 'x'.repeat(200),
        registration_number: 'x'.repeat(50),
        description: 'x'.repeat(2000),
      }),
    ).toEqual([])
  })
})

describe('phone numbers', () => {
  it.each(['0772123456', '+256772123456', '0414 123456', '+256 (414) 123-456', '256312123456'])(
    'accepts %s',
    (value) => expect(isUgandanPhone(value)).toBe(true),
  )
  it.each(['', '12345', '0112123456', '07721234', '+254772123456', 'abc'])('refuses %s', (value) =>
    expect(isUgandanPhone(value)).toBe(false),
  )
})

describe('web addresses', () => {
  it.each(['https://a.example.com', 'http://a.example.com/about?x=1'])('accepts %s', (value) =>
    expect(isWebAddress(value)).toBe(true),
  )
  it.each([
    'a.example.com',
    'javascript:alert(1)',
    'ftp://a.example.com',
    'https://has space.com',
    '',
  ])('refuses %s', (value) => expect(isWebAddress(value)).toBe(false))
})

describe('payload', () => {
  it('turns empty optional fields into null and trims the rest', () => {
    expect(
      toPayload({
        ...valid,
        company_name: '  Ssese Foods Ltd ',
        registration_number: '  ',
        website: '',
        contact_phone: ' 0414 123456 ',
        description: ' About us ',
      }),
    ).toEqual({
      company_name: 'Ssese Foods Ltd',
      registration_number: null,
      website: null,
      contact_phone: '0414 123456',
      district_id: KAMPALA,
      description: 'About us',
    })
  })

  it('round-trips a saved company', () => {
    const employer = makeEmployer()

    expect(toPayload(fromEmployer(employer))).toEqual({
      company_name: employer.company_name,
      registration_number: employer.registration_number,
      website: employer.website,
      contact_phone: employer.contact_phone,
      district_id: employer.district_id,
      description: employer.description,
    })
  })

  it('shows null fields as empty text', () => {
    expect(
      fromEmployer(makeEmployer({ registration_number: null, website: null, description: null })),
    ).toMatchObject({ registration_number: '', website: '', description: '' })
  })
})
