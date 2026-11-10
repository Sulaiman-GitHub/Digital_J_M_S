import { describe, expect, it } from 'vitest'
import { makeItem } from '../applications/testData'
import { makeProfile } from '../profile/testData'
import { buildNotifications, unreadCount } from './notifications'

const base = { applications: [], profile: makeProfile(), emailVerified: true }

describe('buildNotifications', () => {
  it('has nothing to say when everything is done and nothing changed', () => {
    expect(buildNotifications(base)).toEqual([])
  })

  it('ignores applications that are still only submitted', () => {
    expect(buildNotifications({ ...base, applications: [makeItem()] })).toEqual([])
  })

  it('turns an employer decision into a notification that links to the application', () => {
    const items = buildNotifications({
      ...base,
      applications: [
        makeItem({ id: 'a9', status: 'shortlisted', updated_at: '2026-11-09T10:00:00Z' }),
      ],
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      title: 'Ssese Foods Ltd: Shortlisted',
      to: '/applications/a9',
      at: '2026-11-09T10:00:00Z',
    })
    expect(items[0].detail).toContain('Accounts Assistant')
  })

  it('lists the newest update first and the to-do items last', () => {
    const items = buildNotifications({
      applications: [
        makeItem({ id: 'old', status: 'under_review', updated_at: '2026-11-05T08:00:00Z' }),
        makeItem({ id: 'new', status: 'interview', updated_at: '2026-11-08T08:00:00Z' }),
      ],
      profile: null,
      emailVerified: false,
    })

    expect(items.map((item) => item.id.split(':')[1])).toEqual([
      'new',
      'old',
      'verify-email',
      'create-profile',
    ])
  })

  it('does not nag about the profile while it is still loading', () => {
    const items = buildNotifications({ ...base, profile: undefined })
    expect(items).toEqual([])
  })
})

describe('unreadCount', () => {
  const items = buildNotifications({
    applications: [makeItem({ status: 'offered', updated_at: '2026-11-09T10:00:00Z' })],
    profile: null,
    emailVerified: true,
  })

  it('counts everything before anything has been read', () => {
    expect(unreadCount(items, null)).toBe(2)
  })

  it('counts only updates newer than the last read, plus the to-do items', () => {
    expect(unreadCount(items, '2026-11-09T11:00:00Z')).toBe(1)
    expect(unreadCount(items, '2026-11-09T09:00:00Z')).toBe(2)
  })
})
