import { describe, expect, it } from 'vitest'
import {
  calendarDaysBetween,
  closingSoonLabel,
  daysLeft,
  postedLabel,
} from '../../lib/relativeDates'
import { experienceLabel, formatSalary, hostOf, placeLabel } from './format'
import { filterCount, hasAnyFilter, parseJobsState, toJobsSearch } from './searchParams'
import { DEGREE, GULU } from './testData'

const NOW = new Date('2026-11-06T09:00:00Z') // 12:00 in Kampala

describe('relative dates', () => {
  it.each([
    ['2026-11-06T05:00:00Z', 'Posted today'],
    ['2026-11-05T21:00:00Z', 'Posted today'], // midnight in Kampala has passed
    ['2026-11-05T20:59:00Z', 'Posted yesterday'], // 23:59 on 5 Nov in Kampala
    ['2026-11-05T09:00:00Z', 'Posted yesterday'],
    ['2026-11-03T09:00:00Z', 'Posted 3 days ago'],
    ['2026-10-31T09:00:00Z', 'Posted 6 days ago'],
    ['2026-10-30T09:00:00Z', 'Posted 1 week ago'],
    ['2026-10-23T09:00:00Z', 'Posted 2 weeks ago'],
    ['2026-10-10T09:00:00Z', 'Posted 3 weeks ago'],
    ['2026-09-01T09:00:00Z', 'Posted 1 Sept 2026'],
    ['2026-11-07T09:00:00Z', 'Posted today'], // a date in the future never says "-1 days"
  ])('%s -> %s', (iso, label) => {
    expect(postedLabel(iso, NOW)).toBe(label)
  })

  it('counts calendar days in Kampala, not hours', () => {
    expect(calendarDaysBetween('2026-11-05T22:00:00Z', '2026-11-06T05:00:00Z')).toBe(0)
    expect(calendarDaysBetween('2026-11-05T20:59:00Z', '2026-11-06T09:00:00Z')).toBe(1)
    expect(calendarDaysBetween('2026-11-05T21:00:00Z', '2026-11-06T09:00:00Z')).toBe(0)
    expect(calendarDaysBetween('2026-11-04T20:59:00Z', '2026-11-06T09:00:00Z')).toBe(2)
  })

  it.each([
    ['2026-11-06T20:00:00Z', 'Closes today'],
    ['2026-11-07T09:00:00Z', 'Closes tomorrow'],
    ['2026-11-09T09:00:00Z', 'Closes in 3 days'],
    ['2026-11-13T09:00:00Z', 'Closes in 7 days'],
    ['2026-11-14T09:00:00Z', null],
    ['2026-12-20T09:00:00Z', null],
    ['2026-11-01T09:00:00Z', 'Closes today'], // already past: never negative
  ])('closing label for %s is %s', (iso, label) => {
    expect(closingSoonLabel(iso, NOW)).toBe(label)
  })

  it('counts the days left', () => {
    expect(daysLeft('2026-11-28T09:00:00Z', NOW)).toBe(22)
    expect(daysLeft('2026-11-06T18:00:00Z', NOW)).toBe(0)
    expect(daysLeft('2026-10-01T09:00:00Z', NOW)).toBe(0)
  })
})

describe('formatting', () => {
  it.each([
    [1_200_000, 1_500_000, 'UGX 1,200,000 – 1,500,000'],
    [900_000, 900_000, 'UGX 900,000'],
    [900_000, null, 'From UGX 900,000'],
    [null, 1_500_000, 'Up to UGX 1,500,000'],
    [null, null, null],
    [0, 0, 'UGX 0'],
  ])('salary %s to %s', (min, max, text) => {
    expect(formatSalary(min, max)).toBe(text)
  })

  it('names the place', () => {
    expect(placeLabel('Gulu', 'onsite')).toBe('Gulu')
    expect(placeLabel('Gulu', 'hybrid')).toBe('Gulu')
    expect(placeLabel(null, 'remote')).toBe('Remote')
    expect(placeLabel('Gulu', 'remote')).toBe('Remote · Gulu')
    expect(placeLabel(null, 'hybrid')).toBe('Hybrid')
  })

  it('describes experience', () => {
    expect(experienceLabel(0)).toBe('None required')
    expect(experienceLabel(1)).toBe('1 year')
    expect(experienceLabel(5)).toBe('5 years')
  })

  it('shows the host of a link, safely', () => {
    expect(hostOf('https://jobs.kigezihealth.example/apply?id=1')).toBe('jobs.kigezihealth.example')
    expect(hostOf('not a url')).toBe('the employer site')
  })
})

describe('the address of the job list', () => {
  const parse = (search: string) => parseJobsState(new URLSearchParams(search))

  it('reads every filter and the page', () => {
    const state = parse(
      `?q=accounts&district_id=${GULU}&qualification_level_id=${DEGREE}&employment_type=internship&work_arrangement=remote&sort=newest&page=3`,
    )

    expect(state).toEqual({
      filters: {
        q: 'accounts',
        district_id: GULU,
        qualification_level_id: DEGREE,
        employment_type: 'internship',
        work_arrangement: 'remote',
        sort: 'newest',
      },
      page: 3,
    })
  })

  it('ignores anything that is not valid instead of failing', () => {
    expect(
      parse(
        '?district_id=nope&qualification_level_id=1&employment_type=gig&work_arrangement=orbital&sort=cheapest&page=-3&q=%20%20',
      ),
    ).toEqual({ filters: {}, page: 1 })
    expect(parse('?page=2.5').page).toBe(1)
    expect(parse('?page=abc').page).toBe(1)
    expect(parse('?employment_type=constructor').filters).toEqual({})
    expect(parse('?employment_type=toString').filters).toEqual({})
  })

  it('trims and limits the search words', () => {
    expect(parse('?q=%20%20tailor%20').filters.q).toBe('tailor')
    expect(parse(`?q=${'x'.repeat(300)}`).filters.q).toHaveLength(200)
  })

  it('writes a short address: no empty filters, no page 1', () => {
    expect(toJobsSearch({})).toBe('')
    expect(toJobsSearch({ q: 'tailor' })).toBe('?q=tailor')
    expect(toJobsSearch({ q: 'tailor', employment_type: undefined }, 1)).toBe('?q=tailor')
    expect(toJobsSearch({ q: 'tailor' }, 2)).toBe('?q=tailor&page=2')
    expect(toJobsSearch({}, 3)).toBe('?page=3')
  })

  it('round-trips', () => {
    const filters = { q: 'a b', district_id: GULU, employment_type: 'part_time' as const }

    expect(parse(toJobsSearch(filters, 4))).toEqual({ filters, page: 4 })
  })

  it('counts filters, not the search words or sorting', () => {
    expect(filterCount({ q: 'x', sort: 'newest' })).toBe(0)
    expect(filterCount({ district_id: GULU, employment_type: 'contract' })).toBe(2)
    expect(hasAnyFilter({})).toBe(false)
    expect(hasAnyFilter({ q: 'x' })).toBe(true)
    expect(hasAnyFilter({ work_arrangement: 'remote' })).toBe(true)
  })
})
