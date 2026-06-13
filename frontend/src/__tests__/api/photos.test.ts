import { vi, describe, it, expect, beforeEach } from 'vitest'
import request from '../../api/request'

vi.mock('../../api/request', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

describe('photos API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploadPhoto calls POST /photos/upload/:locationId with FormData', async () => {
    const { uploadPhoto } = await import('../../api/photos')
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    await uploadPhoto(1, file)
    expect(request.post).toHaveBeenCalledWith(
      '/photos/upload/1',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    )
  })

  it('uploadPhoto supports progress callback', async () => {
    const { uploadPhoto } = await import('../../api/photos')
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    const onProgress = vi.fn()
    await uploadPhoto(1, file, onProgress)
    expect(request.post).toHaveBeenCalledWith(
      '/photos/upload/1',
      expect.any(FormData),
      expect.objectContaining({
        onUploadProgress: expect.any(Function),
      })
    )
  })

  it('getPhotos calls GET /photos/location/:locationId', async () => {
    const { getPhotos } = await import('../../api/photos')
    await getPhotos(5)
    expect(request.get).toHaveBeenCalledWith('/photos/location/5')
  })

  it('deletePhoto calls DELETE /photos/:photoId', async () => {
    const { deletePhoto } = await import('../../api/photos')
    await deletePhoto(10)
    expect(request.delete).toHaveBeenCalledWith('/photos/10')
  })
})
