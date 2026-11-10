import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Outlet } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Profile, ProfileInput } from '../../api/types'
import { apiError, mockApi, okData, renderRoutes } from '../../test/utils'
import { ProfilePage } from './ProfilePage'
import {
  ACCOUNTING,
  BACHELORS,
  EXCEL,
  GULU,
  GULU_UNIVERSITY,
  PUT_PROFILE,
  makeProfile,
  profileFromInput,
  profileRoutes,
} from './testData'

const PUT = '/api/v1/profile/me'

function Shell() {
  return (
    <>
      <Link to="/account">Leave page</Link>
      <Outlet />
    </>
  )
}

/** The page inside a data router (the unsaved-changes warning needs one). */
function renderPage(
  routes: Record<string, unknown> = profileRoutes(),
  options: { putHandler?: (body: ProfileInput) => Response | Promise<Response> } = {},
) {
  const api = mockApi({
    [PUT_PROFILE]: (request) =>
      options.putHandler
        ? options.putHandler(request.body as ProfileInput)
        : okData(profileFromInput(request.body as ProfileInput)),
    ...(routes as Record<string, () => Response>),
  })
  const view = renderRoutes(
    [
      {
        element: <Shell />,
        children: [
          { path: '/profile/:step?', element: <ProfilePage /> },
          { path: '/account', element: <p>Account page</p> },
        ],
      },
    ],
    { route: '/profile' },
  )
  return { api, ...view }
}

const heading = (name: string) => screen.findByRole('heading', { name, level: 2 })
const click = (name: string | RegExp) => userEvent.click(screen.getByRole('button', { name }))
const setDate = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

async function fillBasics() {
  await userEvent.type(await screen.findByLabelText('Full name'), 'Nakato Sarah')
  await userEvent.selectOptions(screen.getByLabelText('District where you live'), 'Gulu')
}

async function chooseInstitution(name: string) {
  await userEvent.click(screen.getByRole('combobox', { name: 'Institution' }))
  await userEvent.click(screen.getByRole('option', { name }))
}

async function fillEducation() {
  await chooseInstitution('Gulu University')
  await userEvent.selectOptions(screen.getByLabelText('Qualification'), "Bachelor's degree")
}

/** Basics, then Education, then the first save: lands on the Skills step. */
async function firstSave() {
  await fillBasics()
  await click('Continue')
  await heading('Education')
  await fillEducation()
  await click('Save and continue')
  await heading('Skills')
}

const puts = (api: ReturnType<typeof renderPage>['api']) => api.callsTo('PUT', PUT)

describe('loading and errors', () => {
  it('shows a status while loading, then the first step', async () => {
    renderPage()

    expect(screen.getByText('Loading your profile')).toBeInTheDocument()
    expect(await heading('Basics')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 6: Basics')).toBeInTheDocument()
    expect(screen.getByText('0% saved')).toBeInTheDocument()
  })

  it('shows an error with Retry when the profile cannot be loaded, and recovers', async () => {
    let up = false
    renderPage({
      ...profileRoutes(),
      'GET /api/v1/profile/me': () =>
        up ? okData(makeProfile()) : apiError(500, 'internal_error', 'Something went wrong.'),
    })

    expect(await screen.findByText('Could not load your profile')).toBeInTheDocument()

    up = true
    await click('Retry')

    expect(await heading('Skills')).toBeInTheDocument() // resumes where the profile left off
  })

  it('shows an error with Retry when the reference lists cannot be loaded', async () => {
    let up = false
    renderPage({
      ...profileRoutes(),
      'GET /api/v1/reference/districts': () =>
        up ? okData([{ id: GULU, name: 'Gulu', region: 'Northern' }]) : apiError(500, 'x', 'down'),
    })

    expect(await screen.findByText('Could not load your profile')).toBeInTheDocument()

    up = true
    await click('Retry')

    expect(await heading('Basics')).toBeInTheDocument()
  })

  it('treats "no profile yet" (404) as a fresh start, not an error', async () => {
    renderPage()

    expect(await heading('Basics')).toBeInTheDocument()
    expect(screen.queryByText('Could not load your profile')).not.toBeInTheDocument()
  })
})

describe('Basics step', () => {
  it('validates before moving on and sends nothing to the server', async () => {
    const { api } = renderPage()
    await heading('Basics')

    await click('Continue')

    expect(await screen.findByText(/Enter your full name/)).toBeInTheDocument()
    expect(screen.getByText('Choose your district.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Basics', level: 2 })).toBeInTheDocument()
    expect(puts(api)).toHaveLength(0)
  })

  it('refuses a phone number that is not a Ugandan mobile', async () => {
    renderPage()
    await fillBasics()
    await userEvent.type(screen.getByLabelText('Phone number (optional)'), '12345')

    await click('Continue')

    expect(await screen.findByText(/Enter a Ugandan mobile number/)).toBeInTheDocument()
    expect(screen.getByLabelText('Phone number (optional)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('moves to Education without saving anything yet', async () => {
    const { api } = renderPage()
    await fillBasics()

    await click('Continue')

    expect(await heading('Education')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 6: Education')).toBeInTheDocument()
    expect(puts(api)).toHaveLength(0)
  })

  it('gives every section its own address', async () => {
    const { router } = renderPage()
    await fillBasics()
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile/basics'))

    await click('Continue')

    expect(await heading('Education')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/profile/education')
    await router.navigate(-1)
    expect(await heading('Basics')).toBeInTheDocument()
  })

  it('sends a locked section address back to Basics until the first save', async () => {
    const { router } = renderPage()
    await heading('Basics')

    await router.navigate('/profile/skills')

    await waitFor(() => expect(router.state.location.pathname).toBe('/profile/basics'))
    expect(await heading('Basics')).toBeInTheDocument()
  })

  it('keeps Skills, Experience and Summary locked until the first save', async () => {
    renderPage()
    await heading('Basics')

    for (const name of ['Skills', 'Experience', 'Summary']) {
      expect(
        screen.getByRole('button', { name: `${name}, locked until you save the earlier steps` }),
      ).toBeDisabled()
    }
  })
})

describe('Education step', () => {
  async function toEducation() {
    const view = renderPage()
    await fillBasics()
    await click('Continue')
    await heading('Education')
    return view
  }

  it('needs an institution and a qualification', async () => {
    const { api } = await toEducation()

    await click('Save and continue')

    expect(await screen.findByText(/Choose your institution/)).toBeInTheDocument()
    expect(screen.getByText('Choose your qualification.')).toBeInTheDocument()
    expect(puts(api)).toHaveLength(0)
  })

  it('asks for a name when "Other" is chosen', async () => {
    await toEducation()
    await chooseInstitution('Other (type its name)')
    await userEvent.selectOptions(screen.getByLabelText('Qualification'), "Bachelor's degree")

    await click('Save and continue')

    expect(await screen.findByText('Type the name of your institution.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Institution name'), 'Kabale Hills Institute')
    expect(screen.queryByText('Type the name of your institution.')).not.toBeInTheDocument()
  })

  it('shows the date that fits the study status and clears the other one', async () => {
    await toEducation()
    expect(screen.getByLabelText('Graduation date (optional)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Expected completion date (optional)')).not.toBeInTheDocument()
    setDate('Graduation date (optional)', '2025-07-15')

    await userEvent.click(screen.getByRole('radio', { name: 'Still studying' }))

    expect(screen.getByLabelText('Expected completion date (optional)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Graduation date (optional)')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Completed' }))
    expect(screen.getByLabelText('Graduation date (optional)')).toHaveValue('') // cleared
  })

  it('refuses a graduation date in the future', async () => {
    await toEducation()
    await fillEducation()
    setDate('Graduation date (optional)', '2999-01-01')

    await click('Save and continue')

    expect(
      await screen.findByText('The graduation date cannot be in the future.'),
    ).toBeInTheDocument()
  })

  it('lets the field of study be cleared again', async () => {
    await toEducation()
    await userEvent.click(screen.getByRole('combobox', { name: 'Field of study (optional)' }))
    await userEvent.click(screen.getByRole('option', { name: 'Accounting' }))
    expect(screen.getByRole('combobox', { name: 'Field of study (optional)' })).toHaveValue(
      'Accounting',
    )

    await click('Clear field of study')

    expect(screen.getByRole('combobox', { name: 'Field of study (optional)' })).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear field of study' })).not.toBeInTheDocument()
  })
})

describe('the first save', () => {
  it('saves Basics and Education together, then opens Skills with 40% saved', async () => {
    const { api } = renderPage()
    await userEvent.type(await screen.findByLabelText('Full name'), 'Nakato Sarah')
    await userEvent.type(screen.getByLabelText('Phone number (optional)'), '0772 123456')
    await userEvent.selectOptions(screen.getByLabelText('District where you live'), 'Gulu')
    await click('Continue')
    await heading('Education')
    await fillEducation()
    await userEvent.click(screen.getByRole('combobox', { name: 'Field of study (optional)' }))
    await userEvent.click(screen.getByRole('option', { name: 'Accounting' }))
    setDate('Graduation date (optional)', '2025-07-15')

    await click('Save and continue')

    expect(await heading('Skills')).toBeInTheDocument()
    expect(puts(api)).toHaveLength(1)
    expect(puts(api)[0].body).toEqual({
      full_name: 'Nakato Sarah',
      phone: '0772 123456',
      institution_id: GULU_UNIVERSITY,
      institution_other_name: null,
      qualification_level_id: BACHELORS,
      field_of_study_id: ACCOUNTING,
      field_of_study_other: null,
      study_status: 'completed',
      expected_completion_date: null,
      graduation_date: '2025-07-15',
      district_id: GULU,
      summary: null,
      skill_ids: [],
      experiences: [],
    })
    expect(screen.getByText('40% saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Basics, saved' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Experience' })).toBeEnabled() // unlocked now
  })

  it('does not save twice when the button is pressed again while saving', async () => {
    let release: (response: Response) => void = () => {}
    const { api } = renderPage(profileRoutes(), {
      putHandler: (body) =>
        new Promise<Response>((resolve) => {
          release = () => resolve(okData(profileFromInput(body)))
        }),
    })
    await fillBasics()
    await click('Continue')
    await heading('Education')
    await fillEducation()

    await click('Save and continue')
    expect(screen.getByRole('button', { name: /Save and continue/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Save and continue/ }))
    expect(puts(api)).toHaveLength(1)

    release(new Response())
    expect(await heading('Skills')).toBeInTheDocument()
  })
})

describe('Skills step', () => {
  it('searches, adds skills as chips, and saves their ids', async () => {
    const { api } = renderPage()
    await firstSave()

    await userEvent.type(screen.getByRole('combobox', { name: 'Add skills' }), 'exc')
    await userEvent.click(await screen.findByRole('option', { name: 'Microsoft Excel' }))
    expect(screen.getByText('1 of 30 selected')).toBeInTheDocument()
    await click('Save and continue')

    expect(await heading('Experience')).toBeInTheDocument()
    expect(puts(api)).toHaveLength(2)
    expect((puts(api)[1].body as ProfileInput).skill_ids).toEqual([EXCEL])
    expect(screen.getByText('60% saved')).toBeInTheDocument()
  })

  it('removes a chosen skill', async () => {
    renderPage(profileRoutes(makeProfile({ skills: [{ id: EXCEL, name: 'Microsoft Excel' }] })))
    await heading('Experience') // resumes after skills

    await userEvent.click(screen.getByRole('button', { name: 'Skills, saved' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Microsoft Excel' }))

    expect(screen.getByText('0 of 30 selected')).toBeInTheDocument()
  })

  it('can be skipped without saving anything', async () => {
    const { api } = renderPage()
    await firstSave()

    await click('Skip for now')

    expect(await heading('Experience')).toBeInTheDocument()
    expect(puts(api)).toHaveLength(1) // only the first save
  })

  it('stops at 30 skills', async () => {
    const thirty = Array.from({ length: 30 }, (_, n) => ({ id: `skill-${n}`, name: `Skill ${n}` }))
    renderPage(profileRoutes(makeProfile({ skills: thirty, experiences: [], summary: null })))
    await heading('Experience')

    await userEvent.click(screen.getByRole('button', { name: 'Skills, saved' }))

    const input = await screen.findByRole('combobox', { name: 'Add skills' })
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('placeholder', 'Maximum of 30 skills chosen')
    expect(screen.getByText('30 of 30 selected')).toBeInTheDocument()
  })

  it('says when the suggestions cannot be loaded', async () => {
    renderPage({
      ...profileRoutes(),
      'GET /api/v1/reference/skills?q=*': () => apiError(500, 'x', 'down'),
    })
    await firstSave()

    await userEvent.click(screen.getByRole('combobox', { name: 'Add skills' }))

    expect(await screen.findByText(/Could not load suggestions/)).toBeInTheDocument()
  })
})

describe('Experience step', () => {
  async function toExperience() {
    const view = renderPage()
    await firstSave()
    await click('Skip for now')
    await heading('Experience')
    return view
  }

  async function fillEntry() {
    await userEvent.type(screen.getByLabelText('Job title'), 'Accounts Intern')
    await userEvent.type(screen.getByLabelText('Organisation'), 'Ssese Fresh Foods Ltd')
    setDate('Start date', '2024-01-08')
    setDate('End date', '2024-06-28')
  }

  it('adds an entry, validates it and saves it', async () => {
    const { api } = await toExperience()
    await click('+ Add an experience')

    await click('Save and continue')
    expect(await screen.findByText('Enter the job title.')).toBeInTheDocument()
    expect(screen.getByText('Enter the organisation.')).toBeInTheDocument()
    expect(screen.getByText('Enter the start date.')).toBeInTheDocument()
    expect(puts(api)).toHaveLength(1)

    await fillEntry()
    await click('Save and continue')

    expect(await heading('Summary')).toBeInTheDocument()
    expect((puts(api)[1].body as ProfileInput).experiences).toEqual([
      {
        title: 'Accounts Intern',
        organisation: 'Ssese Fresh Foods Ltd',
        start_date: '2024-01-08',
        end_date: '2024-06-28',
        description: null,
      },
    ])
    expect(screen.getByText('60% saved')).toBeInTheDocument()
  })

  it('refuses an end date before the start date', async () => {
    await toExperience()
    await click('+ Add an experience')
    await fillEntry()
    setDate('End date', '2023-06-28')

    await click('Save and continue')

    expect(
      await screen.findByText('The end date cannot be before the start date.'),
    ).toBeInTheDocument()
  })

  it('"I still work here" clears and disables the end date, and saves it as empty', async () => {
    const { api } = await toExperience()
    await click('+ Add an experience')
    await fillEntry()

    await userEvent.click(screen.getByRole('checkbox', { name: 'I still work here' }))

    expect(screen.getByLabelText('End date')).toBeDisabled()
    expect(screen.getByLabelText('End date')).toHaveValue('')
    await click('Save and continue')
    await heading('Summary')
    expect((puts(api)[1].body as ProfileInput).experiences[0].end_date).toBeNull()
  })

  it('counts the description and removes an entry', async () => {
    await toExperience()
    await click('+ Add an experience')
    await userEvent.type(screen.getByLabelText('What did you do? (optional)'), 'Filing')

    expect(screen.getByText('6 of 1000')).toBeInTheDocument()

    await click('Remove experience 1')
    expect(screen.queryByLabelText('Job title')).not.toBeInTheDocument()
  })

  it('stops at 10 experiences', async () => {
    const ten = Array.from({ length: 10 }, (_, n) => ({
      id: `e${n}`,
      title: `Role ${n}`,
      organisation: 'Gulu Traders',
      start_date: '2024-01-01',
      end_date: null,
      description: null,
    }))
    renderPage(
      profileRoutes(
        makeProfile({ experiences: ten, skills: [{ id: EXCEL, name: 'Microsoft Excel' }] }),
      ),
    )
    await heading('Summary')
    await userEvent.click(screen.getByRole('button', { name: 'Experience, saved' }))

    expect(await screen.findByRole('button', { name: '+ Add another experience' })).toBeDisabled()
    expect(screen.getByText(/maximum of 10 experiences/)).toBeInTheDocument()
  })
})

describe('Summary step', () => {
  it('shows a review, saves the summary and confirms', async () => {
    const { api } = renderPage(
      profileRoutes(
        makeProfile({
          skills: [{ id: EXCEL, name: 'Microsoft Excel' }],
          experiences: [
            {
              id: 'e',
              title: 'Tutor',
              organisation: 'Gulu High',
              start_date: '2024-01-01',
              end_date: null,
              description: null,
            },
          ],
        }),
      ),
    )
    await heading('Summary')
    const review = screen.getByRole('region', { name: 'Review' })
    expect(within(review).getByText(/Nakato Sarah/)).toBeInTheDocument()
    expect(
      within(review).getByText(/Bachelor's degree · Accounting · Gulu University/),
    ).toBeInTheDocument()
    expect(within(review).getByText('Microsoft Excel')).toBeInTheDocument()
    expect(within(review).getByText('Tutor, Gulu High')).toBeInTheDocument()

    await userEvent.type(
      screen.getByLabelText('About you (optional)'),
      'Looking for a trainee role.',
    )
    expect(screen.getByText('27 of 1000')).toBeInTheDocument()
    await click('Save profile')

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
    expect((puts(api)[0].body as ProfileInput).summary).toBe('Looking for a trainee role.')
    expect(screen.getByText('100% saved')).toBeInTheDocument()
  })

  it('jumps back to a step from the review', async () => {
    renderPage(
      profileRoutes(
        makeProfile({
          skills: [{ id: EXCEL, name: 'Microsoft Excel' }],
          experiences: [
            {
              id: 'e',
              title: 'Tutor',
              organisation: 'Gulu High',
              start_date: '2024-01-01',
              end_date: null,
              description: null,
            },
          ],
        }),
      ),
    )
    await heading('Summary')

    await click('Edit education')

    expect(await heading('Education')).toBeInTheDocument()
  })

  it('hides the "saved" message again as soon as something is edited', async () => {
    renderPage(
      profileRoutes(
        makeProfile({
          skills: [{ id: EXCEL, name: 'Microsoft Excel' }],
          experiences: [
            {
              id: 'e',
              title: 'Tutor',
              organisation: 'Gulu High',
              start_date: '2024-01-01',
              end_date: null,
              description: null,
            },
          ],
        }),
      ),
    )
    await heading('Summary')
    await click('Save profile')
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('About you (optional)'), 'x')

    expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
  })
})

describe('resuming', () => {
  it.each([
    ['nothing saved yet', null, 'Basics'],
    ['a profile without skills', makeProfile(), 'Skills'],
    [
      'skills but no experience',
      makeProfile({ skills: [{ id: EXCEL, name: 'Microsoft Excel' }] }),
      'Experience',
    ],
  ])('opens at the first unfinished step for %s', async (_label, profile: Profile | null, step) => {
    renderPage(profileRoutes(profile))

    expect(await heading(step)).toBeInTheDocument()
  })

  it('fills the form from the saved profile', async () => {
    renderPage(profileRoutes(makeProfile()))
    await heading('Skills')

    await userEvent.click(screen.getByRole('button', { name: 'Basics, saved' }))

    expect(await screen.findByLabelText('Full name')).toHaveValue('Nakato Sarah')
    expect(screen.getByLabelText('Phone number (optional)')).toHaveValue('+256772123456')
    expect(screen.getByLabelText('District where you live')).toHaveValue(GULU)
    expect(screen.getByText('40% saved')).toBeInTheDocument()
  })

  it('lets the user go back a step', async () => {
    renderPage()
    await fillBasics()
    await click('Continue')
    await heading('Education')

    await click('Back')

    expect(await heading('Basics')).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveValue('Nakato Sarah') // answers kept
  })
})

describe('errors from the server', () => {
  it('shows a field error from the server under the field, on the same step', async () => {
    renderPage(profileRoutes(), {
      putHandler: () =>
        apiError(422, 'validation_error', 'Some fields are invalid.', {
          fields: { institution_id: 'Choose an institution from the list.' },
        }),
    })
    await fillBasics()
    await click('Continue')
    await heading('Education')
    await fillEducation()

    await click('Save and continue')

    expect(await screen.findByText('Choose an institution from the list.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Fix the field marked in red.')
    expect(screen.getByRole('heading', { name: 'Education', level: 2 })).toBeInTheDocument()
  })

  it('jumps to the step that owns a field the server rejected', async () => {
    let rejected = true
    renderPage(profileRoutes(makeProfile()), {
      putHandler: (body) =>
        rejected
          ? apiError(422, 'validation_error', 'Some fields are invalid.', {
              fields: { phone: 'Enter a Ugandan mobile number, like 0772 123456.' },
            })
          : okData(profileFromInput(body)),
    })
    await heading('Skills')

    await click('Save and continue')

    expect(await heading('Basics')).toBeInTheDocument()
    expect(screen.getByText('Enter a Ugandan mobile number, like 0772 123456.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('on the Basics step')

    // Fixing the field clears the server's message straight away, and the next save works.
    rejected = false
    await userEvent.clear(screen.getByLabelText('Phone number (optional)'))
    await userEvent.type(screen.getByLabelText('Phone number (optional)'), '0772123456')
    await waitFor(() =>
      expect(
        screen.queryByText('Enter a Ugandan mobile number, like 0772 123456.'),
      ).not.toBeInTheDocument(),
    )
    await click('Continue')
    await heading('Education')
    await click('Save and continue')
    expect(await heading('Skills')).toBeInTheDocument() // the server accepts it now
  })

  it('stops showing an error as soon as the user fixes that field', async () => {
    renderPage()
    await heading('Basics')
    await click('Continue')
    expect(await screen.findByText('Choose your district.')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('District where you live'), 'Gulu')

    await waitFor(() => expect(screen.queryByText('Choose your district.')).not.toBeInTheDocument())
    // Other fields that were never wrong are not nagged about while typing.
    expect(screen.getByText(/Enter your full name/)).toBeInTheDocument()
  })

  it("maps the server's skill_ids error to the Skills step", async () => {
    renderPage(profileRoutes(makeProfile({ skills: [{ id: EXCEL, name: 'Microsoft Excel' }] })), {
      putHandler: () =>
        apiError(422, 'validation_error', 'Some fields are invalid.', {
          fields: { skill_ids: 'One or more skills are not available. Pick them from the list.' },
        }),
    })
    await heading('Experience')
    await click('Save and continue') // saves with no experience entries
    expect(await screen.findByText(/skills are not available/)).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Skills', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('on the Skills step')
  })

  it('shows other expected errors (such as a rate limit) in an alert and keeps the answers', async () => {
    renderPage(profileRoutes(makeProfile()), {
      putHandler: () =>
        apiError(429, 'rate_limited', 'Too many requests. Please wait a minute and try again.'),
    })
    await heading('Skills')

    await click('Save and continue')

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
    expect(screen.getByRole('heading', { name: 'Skills', level: 2 })).toBeInTheDocument()
  })

  it('shows server trouble as a toast, not as a form error', async () => {
    renderPage(profileRoutes(makeProfile()), {
      putHandler: () =>
        apiError(500, 'internal_error', 'Something went wrong on our side. Please try again.'),
    })
    await heading('Skills')

    await click('Save and continue')

    expect(
      await screen.findByText('Something went wrong on our side. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a network failure as a toast', async () => {
    renderPage(profileRoutes(makeProfile()), {
      putHandler: () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await heading('Skills')

    await click('Save and continue')

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
  })
})

describe('unsaved changes', () => {
  it('asks before leaving with unsaved changes, and lets the user keep editing', async () => {
    renderPage()
    await userEvent.type(await screen.findByLabelText('Full name'), 'Nak')

    await userEvent.click(screen.getByRole('link', { name: 'Leave page' }))

    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    expect(dialog).toHaveTextContent('If you leave now they will be lost.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Full name')).toHaveValue('Nak')
    expect(screen.queryByText('Account page')).not.toBeInTheDocument()
  })

  it('leaves when the user chooses Leave', async () => {
    renderPage()
    await userEvent.type(await screen.findByLabelText('Full name'), 'Nak')

    await userEvent.click(screen.getByRole('link', { name: 'Leave page' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }))

    expect(await screen.findByText('Account page')).toBeInTheDocument()
  })

  it('does not ask when nothing has changed', async () => {
    renderPage(profileRoutes(makeProfile()))
    await heading('Skills')

    await userEvent.click(screen.getByRole('link', { name: 'Leave page' }))

    expect(await screen.findByText('Account page')).toBeInTheDocument()
  })

  it('does not ask after a successful save', async () => {
    renderPage()
    await firstSave()

    await userEvent.click(screen.getByRole('link', { name: 'Leave page' }))

    expect(await screen.findByText('Account page')).toBeInTheDocument()
  })

  it('also warns on reload and tab close, only while there are unsaved changes', async () => {
    renderPage()
    const name = await screen.findByLabelText('Full name')

    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    await userEvent.type(name, 'N')
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
  })
})

describe('CV and consent step', () => {
  const stepButton = () => screen.getByRole('button', { name: /^CV and consent/ })

  it('is open to everyone, even before the first save, and is the last step', async () => {
    renderPage()
    await heading('Basics')

    expect(stepButton()).toBeEnabled()
    await userEvent.click(stepButton())

    expect(await heading('CV and consent')).toBeInTheDocument()
    expect(screen.getByText('Step 6 of 6: CV and consent')).toBeInTheDocument()
  })

  it('shows the CV uploader and the sharing opt-in, with no Save button', async () => {
    renderPage(profileRoutes(makeProfile()))
    await heading('Skills')
    await userEvent.click(stepButton())
    await heading('CV and consent')

    expect(await screen.findByText('No CV yet')).toBeInTheDocument()
    expect(
      await screen.findByRole('checkbox', {
        name: 'Employers I apply to may see my profile and CV',
      }),
    ).not.toBeChecked()
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
  })

  it('goes back to the Summary step', async () => {
    renderPage(profileRoutes(makeProfile()))
    await heading('Skills')
    await userEvent.click(stepButton())
    await heading('CV and consent')

    await click('Back')

    expect(await heading('Summary')).toBeInTheDocument()
  })

  it('marks the step done once a CV exists', async () => {
    renderPage({
      ...profileRoutes(makeProfile()),
      'GET /api/v1/cv/me': () =>
        okData({
          id: 'cv-1',
          original_filename: 'cv.pdf',
          content_type: 'application/pdf',
          size_bytes: 1000,
          created_at: '2026-11-05T09:00:00Z',
        }),
    })
    await heading('Skills')

    expect(await screen.findByRole('button', { name: /^CV and consent.*saved/i })).toBeVisible()
  })

  it('is reachable from the saved Summary step', async () => {
    renderPage(
      profileRoutes(
        makeProfile({
          skills: [{ id: EXCEL, name: 'Microsoft Excel' }],
          experiences: [
            {
              id: 'e',
              title: 'Tutor',
              organisation: 'Gulu High',
              start_date: '2024-01-01',
              end_date: null,
              description: null,
            },
          ],
        }),
      ),
    )
    await heading('Summary')

    await click('Save profile')
    await userEvent.click(await screen.findByRole('button', { name: 'Next: CV and consent' }))

    expect(await heading('CV and consent')).toBeInTheDocument()
  })
})
