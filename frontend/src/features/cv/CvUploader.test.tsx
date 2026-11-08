import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Cv } from '../../api/types'
import { FakeXhr, installFakeXhr } from '../../test/fakeXhr'
import { apiError, loggedIn, makeUser, mockApi, okData, renderWithAuth } from '../../test/utils'
import { CV_MAX_BYTES } from './cvRules'
import { CvUploader } from './CvUploader'

const CV_PATH = '/api/v1/cv/me'
const GET_CV = `GET ${CV_PATH}`
const DELETE_CV = `DELETE ${CV_PATH}`

const user = userEvent.setup({ applyAccept: false })

const CV: Cv = {
  id: 'cv-1',
  original_filename: 'Nakato Sarah CV.pdf',
  content_type: 'application/pdf',
  size_bytes: 245_760,
  created_at: '2026-11-05T09:00:00Z',
}

const noCv = () => apiError(404, 'cv_not_found', 'You have not uploaded a CV yet.')

function pdf(name = 'cv.pdf', size = 1000): File {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function setup(cv: Cv | null = null) {
  const api = mockApi({
    ...loggedIn(makeUser()),
    [GET_CV]: () => (cv ? okData(cv) : noCv()),
    [DELETE_CV]: () => new Response(null, { status: 204 }),
  })
  renderWithAuth(<CvUploader />)
  return api
}

const fileInput = () => screen.getByLabelText('CV file') as HTMLInputElement

beforeEach(() => {
  installFakeXhr()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loading, empty and error states', () => {
  it('shows a status while loading, then the empty state with a way to choose a file', async () => {
    setup()

    expect(screen.getByText('Loading your CV')).toBeInTheDocument()
    expect(await screen.findByText('No CV yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeInTheDocument()
    expect(screen.getByText(/PDF or Word file, up to 5\.0 MB/)).toBeInTheDocument()
  })

  it('shows an error with Retry, and recovers when the retry works', async () => {
    let fail = true
    mockApi({
      ...loggedIn(makeUser()),
      [GET_CV]: () => (fail ? apiError(500, 'internal_error', 'Server error') : noCv()),
    })
    renderWithAuth(<CvUploader />)

    expect(await screen.findByText('Could not load your CV')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('No CV yet')).toBeInTheDocument()
  })

  it('shows the current CV with its details, a download link, Replace and Delete', async () => {
    setup(CV)

    expect(await screen.findByText('Nakato Sarah CV.pdf')).toBeInTheDocument()
    expect(screen.getByText(/240 KB · Uploaded 5 Nov 2026/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/v1/cv/me/download',
    )
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByText('No CV yet')).not.toBeInTheDocument()
  })
})

describe('choosing a file', () => {
  it('only offers PDF and Word files in the file picker', async () => {
    setup()
    await screen.findByText('No CV yet')

    expect(fileInput()).toHaveAttribute('accept', '.pdf,.doc,.docx')
  })

  it.each([
    ['cv.exe', 'Choose a PDF or Word file'],
    ['notes.txt', 'Choose a PDF or Word file'],
    ['cv', 'Choose a PDF or Word file'],
    ['photo.png', 'Choose a PDF or Word file'],
  ])('refuses %s on the client without uploading', async (name, message) => {
    setup()
    await screen.findByText('No CV yet')

    await user.upload(fileInput(), pdf(name))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(FakeXhr.instances).toHaveLength(0)
  })

  it('refuses a file over the size limit and says how big it is', async () => {
    setup()
    await screen.findByText('No CV yet')

    await user.upload(fileInput(), pdf('big.pdf', CV_MAX_BYTES + 1))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is 5.0 MB. The limit is 5.0 MB.',
    )
    expect(FakeXhr.instances).toHaveLength(0)
  })

  it('refuses an empty file', async () => {
    setup()
    await screen.findByText('No CV yet')

    await user.upload(fileInput(), pdf('empty.pdf', 0))

    expect(await screen.findByRole('alert')).toHaveTextContent('This file is empty')
    expect(FakeXhr.instances).toHaveLength(0)
  })

  it.each(['cv.pdf', 'CV.DOCX', 'old.doc'])('accepts %s', async (name) => {
    setup()
    await screen.findByText('No CV yet')

    await user.upload(fileInput(), pdf(name))

    expect(FakeXhr.instances).toHaveLength(1)
  })

  it('clears an earlier problem when a good file is chosen', async () => {
    setup()
    await screen.findByText('No CV yet')
    await user.upload(fileInput(), pdf('cv.exe'))
    await screen.findByRole('alert')

    await user.upload(fileInput(), pdf('cv.pdf'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('uploading', () => {
  it('sends the file as multipart with the session, shows progress, then the saved CV', async () => {
    setup()
    await screen.findByText('No CV yet')

    await user.upload(fileInput(), pdf('Nakato Sarah CV.pdf'))

    expect(await screen.findByText('Uploading your CV…')).toBeInTheDocument()
    const request = FakeXhr.last()
    expect(request.method).toBe('POST')
    expect(request.url).toBe(CV_PATH)
    expect(request.withCredentials).toBe(true)
    expect((request.body as FormData).get('file')).toBeInstanceOf(File)
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )

    request.progress(500, 1000)
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute(
        'aria-valuenow',
        '50',
      ),
    )
    expect(screen.getByText('50%')).toBeInTheDocument()

    request.respond(201, { data: CV })

    expect(await screen.findByText('Nakato Sarah CV.pdf')).toBeInTheDocument()
    expect(await screen.findByText('Your CV is saved.')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('replaces an existing CV', async () => {
    setup(CV)
    await screen.findByText('Nakato Sarah CV.pdf')

    await user.upload(fileInput(), pdf('New CV.pdf'))
    FakeXhr.last().respond(201, { data: { ...CV, original_filename: 'New CV.pdf' } })

    expect(await screen.findByText('New CV.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Nakato Sarah CV.pdf')).not.toBeInTheDocument()
  })

  it('explains a 413 from the server', async () => {
    setup()
    await screen.findByText('No CV yet')
    await user.upload(fileInput(), pdf())

    FakeXhr.last().respond(413, {
      error: { code: 'file_too_large', message: 'This file is too big.', details: null },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is too big. The limit is 5.0 MB. Try a smaller file.',
    )
    expect(await screen.findByText('No CV yet')).toBeInTheDocument()
  })

  it('explains a 415 for the wrong file type', async () => {
    setup()
    await screen.findByText('No CV yet')
    await user.upload(fileInput(), pdf())

    FakeXhr.last().respond(415, {
      error: {
        code: 'unsupported_file_type',
        message: 'Upload a PDF or Word file (.pdf, .doc or .docx).',
        details: null,
      },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Upload a PDF or Word file (.pdf, .doc or .docx).',
    )
  })

  it('explains a file that is not really what its name says', async () => {
    setup()
    await screen.findByText('No CV yet')
    await user.upload(fileInput(), pdf())

    FakeXhr.last().respond(415, {
      error: {
        code: 'file_type_mismatch',
        message: 'This file is not a real PDF document, even though it is named .pdf.',
        details: null,
      },
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('not a real PDF document')
    expect(alert).toHaveTextContent('Save it again as a PDF or Word file')
  })

  it('keeps the current CV when a replacement fails', async () => {
    setup(CV)
    await screen.findByText('Nakato Sarah CV.pdf')
    await user.upload(fileInput(), pdf())

    FakeXhr.last().respond(415, {
      error: { code: 'file_type_mismatch', message: 'Not real.', details: null },
    })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Nakato Sarah CV.pdf')).toBeInTheDocument()
  })

  it('says so when the connection fails', async () => {
    setup()
    await screen.findByText('No CV yet')
    await user.upload(fileInput(), pdf())

    FakeXhr.last().fail()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server')
  })

  it('says so when too many uploads were made', async () => {
    setup()
    await screen.findByText('No CV yet')
    await user.upload(fileInput(), pdf())

    FakeXhr.last().respond(429, {
      error: { code: 'rate_limited', message: 'Too many requests.', details: null },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many uploads')
  })

  it('lets the user cancel without showing an error', async () => {
    setup()
    await screen.findByText('No CV yet')
    await user.upload(fileInput(), pdf())
    await screen.findByText('Uploading your CV…')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(FakeXhr.last().aborted).toBe(true)
    expect(await screen.findByText('No CV yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not show Replace or Delete while an upload is running', async () => {
    setup(CV)
    await screen.findByText('Nakato Sarah CV.pdf')

    await user.upload(fileInput(), pdf())

    expect(await screen.findByText('Uploading your CV…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

describe('deleting', () => {
  it('asks first, and does nothing if the user keeps the CV', async () => {
    const api = setup(CV)
    await screen.findByText('Nakato Sarah CV.pdf')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your CV?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))

    expect(api.callsTo('DELETE', CV_PATH)).toHaveLength(0)
    expect(screen.getByText('Nakato Sarah CV.pdf')).toBeInTheDocument()
  })

  it('deletes after confirming and shows the empty state', async () => {
    const api = setup(CV)
    await screen.findByText('Nakato Sarah CV.pdf')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your CV?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete CV' }))

    expect(await screen.findByText('No CV yet')).toBeInTheDocument()
    expect(api.callsTo('DELETE', CV_PATH)).toHaveLength(1)
    expect(await screen.findByText('Your CV was deleted.')).toBeInTheDocument()
  })

  it('shows an error and keeps the CV if the delete fails', async () => {
    mockApi({
      ...loggedIn(makeUser()),
      [GET_CV]: () => okData(CV),
      [DELETE_CV]: () => apiError(500, 'internal_error', 'Something went wrong on our side.'),
    })
    renderWithAuth(<CvUploader />)
    await screen.findByText('Nakato Sarah CV.pdf')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your CV?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete CV' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByText('Nakato Sarah CV.pdf')).toBeInTheDocument()
  })

  it('shows the empty state if the CV was already deleted elsewhere', async () => {
    let gone = false
    mockApi({
      ...loggedIn(makeUser()),
      [GET_CV]: () => (gone ? noCv() : okData(CV)),
      [DELETE_CV]: () => {
        gone = true
        return apiError(404, 'cv_not_found', 'You have not uploaded a CV yet.')
      },
    })
    renderWithAuth(<CvUploader />)
    await screen.findByText('Nakato Sarah CV.pdf')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your CV?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete CV' }))

    expect(await screen.findByText('No CV yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
