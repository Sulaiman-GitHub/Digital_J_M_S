import { describe, expect, it } from 'vitest'
import { answer, normalise } from './answer'
import { FALLBACK, TOPICS } from './knowledge'

describe('normalise', () => {
  it('lower-cases, drops punctuation and collapses spaces', () => {
    expect(normalise('  How do I APPLY?!  ')).toBe('how do i apply')
    expect(normalise("What's up")).toBe('whats up')
  })
})

describe('answer', () => {
  it.each([
    ['How do I apply for a job?', 'Open a job and press Apply'],
    ['how to register', 'Choose Register'],
    ['I want to sign up', 'Choose Register'],
    ['how do i upload my cv', 'CV and consent'],
    ['What does shortlisted mean?', 'Shortlisted: you are among'],
    ['how do I post a vacancy', 'administrator reviews it'],
    ['I forgot my password', 'Forgot password'],
    ['the verification email did not arrive', 'spam folder'],
    ['can I delete my account', 'delete your account'],
    ['is it free', 'free'],
    ['how do I turn on dark mode', 'sun/moon'],
  ])('answers %s', (question, expected) => {
    expect(answer(question, undefined).text).toContain(expected)
  })

  it('greets short hellos and thanks, but not a long question that contains "help"', () => {
    expect(answer('hello', undefined).text).toMatch(/^Hello/)
    expect(answer('thanks!', undefined).text).toMatch(/welcome/)
    expect(answer('please help me apply for jobs', undefined).text).toContain('press Apply')
  })

  it('matches whole words only', () => {
    // "this" contains "hi", and "capply" contains "apply": neither should trigger a topic.
    expect(answer('this capply', undefined)).toBe(FALLBACK)
  })

  it('falls back with suggestions when it does not understand', () => {
    const reply = answer('purple elephants dancing', undefined)
    expect(reply).toBe(FALLBACK)
    expect(reply.suggestions?.length).toBeGreaterThan(0)
    expect(answer('   ', undefined)).toBe(FALLBACK)
  })

  it('tailors the links to who is asking', () => {
    const visitor = answer('how do i apply', undefined)
    const seeker = answer('how do i apply', 'job_seeker')
    expect(visitor.links?.map((link) => link.to)).toContain('/register')
    expect(seeker.links?.map((link) => link.to)).toContain('/profile')
    expect(answer('how do i register', 'employer').text).toContain('already have an account')
  })

  it('does not invent contact details', () => {
    const reply = answer('what is your support phone number', undefined)
    expect(reply.text).toContain('do not have a support phone number')
    expect(JSON.stringify(reply)).not.toMatch(/\+?\d{9,}/)
  })

  it('copes with very long and odd input', () => {
    expect(() => answer('apply '.repeat(5000), undefined)).not.toThrow()
    expect(() => answer('<script>alert(1)</script>', undefined)).not.toThrow()
  })

  it('only links to pages that exist in the app', () => {
    const known = new Set([
      '/',
      '/jobs',
      '/register',
      '/login',
      '/forgot-password',
      '/account',
      '/profile',
      '/profile/cv',
      '/saved',
      '/applications',
      '/employer',
      '/employer/vacancies/new',
      '/admin/employers',
      '/admin/reports',
      '/privacy',
      '/terms',
      '/#faq',
    ])
    for (const topic of TOPICS) {
      for (const role of [undefined, 'job_seeker', 'employer', 'admin'] as const) {
        for (const link of topic.reply(role).links ?? []) {
          expect(known.has(link.to), `${topic.id}: ${link.to}`).toBe(true)
        }
      }
    }
  })
})
