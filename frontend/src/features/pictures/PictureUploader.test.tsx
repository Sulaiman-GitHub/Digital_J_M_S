import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Picture } from '../../api/types'
import { FakeXhr, installFakeXhr } from '../../test/fakeXhr'
import { apiError, loggedIn, makeUser, mockApi, okData, renderWithAuth } from '../../test/utils'
import { PICTURE_MAX_BYTES, checkPictureFile } from './pictureRules'
import { PictureUploader } from './PictureUploader'

const user = userEvent.setup({ applyAccept: false })

const PHOTO: Picture = {
  content_type: 'image/png',
  size_bytes: 12_000,
  created_at: '2026-11-07T09:00:00Z',
}
const none = () => apiError(404, 'photo_not_found', 'You have not uploaded a photo yet.')

function picture(name = 'me.png', type = 'image/png', size = 1000): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function setup(current: Picture | null = null) {
  const api = mockApi({
    ...loggedIn(makeUser()),
    'GET /api/v1/photo/me': () => (current ? okData(current) : none()),
    'DELETE /api/v1/photo/me': () => new Response(null, { status: 204 }),
  })
  renderWithAuth(<PictureUploader kind="photo" name="Nakato Sarah" />)
  return api
}

const fileInput = () => screen.getByLabelText('Profile photo file') as HTMLInputElement

beforeEach(() => {
  installFakeXhr()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PictureUploader states', () => {
  it('shows a status while loading, then initials and a way to choose a photo', async () => {
    setup()

    expect(screen.getByText('Loading your photo')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Choose a photo' })).toBeInTheDocument()
    expect(screen.getByText('NS')).toBeInTheDocument() // initials until there is a picture
    expect(screen.getByText(/JPEG, PNG or WebP, up to 2 MB/)).toBeInTheDocument()
  })

  it('shows an error with Retry, and recovers when the retry works', async () => {
    let fail = true
    mockApi({
      ...loggedIn(makeUser()),
      'GET /api/v1/photo/me': () =>
        fail ? apiError(500, 'internal_error', 'Server error') : none(),
    })
    renderWithAuth(<PictureUploader kind="photo" name="Nakato Sarah" />)

    expect(await screen.findByText('Could not load your photo')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('button', { name: 'Choose a photo' })).toBeInTheDocument()
  })

  it('with a photo, shows it and offers Replace and Remove', async () => {
    setup(PHOTO)

    expect(await screen.findByRole('button', { name: 'Replace photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
    const image = document.querySelector('img') as HTMLImageElement
    expect(image.getAttribute('src')).toBe(
      `/api/v1/photo/me/image?v=${encodeURIComponent(PHOTO.created_at)}`,
    )
  })
})

describe('choosing a file', () => {
  it('refuses a file that is not a picture, without sending anything', async () => {
    setup()
    await screen.findByRole('button', { name: 'Choose a photo' })

    await user.upload(fileInput(), picture('cv.pdf', 'application/pdf'))

    expect(await screen.findByText('Choose a JPEG, PNG or WebP picture.')).toBeInTheDocument()
    expect(FakeXhr.instances).toHaveLength(0)
  })

  it('refuses a picture over the size limit', async () => {
    setup()
    await screen.findByRole('button', { name: 'Choose a photo' })

    await user.upload(fileInput(), picture('big.png', 'image/png', PICTURE_MAX_BYTES + 1))

    expect(await screen.findByText(/The limit is 2\.0 MB/)).toBeInTheDocument()
    expect(FakeXhr.instances).toHaveLength(0)
  })

  it('uploads a good picture and then shows Replace', async () => {
    setup()
    await screen.findByRole('button', { name: 'Choose a photo' })

    await user.upload(fileInput(), picture())
    const request = FakeXhr.last()
    expect(request.method).toBe('POST')
    expect(request.url).toBe('/api/v1/photo/me')
    request.respond(201, { data: PHOTO })

    expect(await screen.findByRole('button', { name: 'Replace photo' })).toBeInTheDocument()
    expect(await screen.findByText('Your photo is saved.')).toBeInTheDocument()
  })

  it('shows what the server said when it refuses the picture', async () => {
    setup()
    await screen.findByRole('button', { name: 'Choose a photo' })

    await user.upload(fileInput(), picture())
    FakeXhr.last().respond(415, {
      error: { code: 'unsupported_file_type', message: 'Upload a JPEG, PNG or WebP picture.' },
    })

    expect(await screen.findByText('Upload a JPEG, PNG or WebP picture.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a photo' })).toBeInTheDocument()
  })
})

describe('removing', () => {
  it('removes the photo and goes back to the initials', async () => {
    const api = setup(PHOTO)
    await user.click(await screen.findByRole('button', { name: 'Remove photo' }))

    expect(await screen.findByRole('button', { name: 'Choose a photo' })).toBeInTheDocument()
    expect(api.callsTo('DELETE', '/api/v1/photo/me')).toHaveLength(1)
    expect(screen.getByText('NS')).toBeInTheDocument()
  })
})

describe('checkPictureFile', () => {
  it('accepts JPEG, PNG and WebP and refuses everything else', () => {
    expect(checkPictureFile({ type: 'image/jpeg', size: 10 })).toBeNull()
    expect(checkPictureFile({ type: 'image/png', size: 10 })).toBeNull()
    expect(checkPictureFile({ type: 'image/webp', size: 10 })).toBeNull()
    expect(checkPictureFile({ type: 'image/svg+xml', size: 10 })).not.toBeNull()
    expect(checkPictureFile({ type: 'image/gif', size: 10 })).not.toBeNull()
    expect(checkPictureFile({ type: 'image/png', size: 0 })).toMatch(/empty/)
  })
})
