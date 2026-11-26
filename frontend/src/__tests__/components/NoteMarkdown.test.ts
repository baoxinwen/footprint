import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach } from 'vitest'

const releaseMock = vi.hoisted(() => vi.fn())
const acquireMock = vi.hoisted(() => vi.fn())

vi.mock('../../utils/authenticatedImage', () => ({
  isPrivatePhotoUrl: (src: string) => src.startsWith('/api/photos/'),
  acquireImageResource: acquireMock,
}))

import NoteMarkdown from '../../components/NoteMarkdown.vue'

enableAutoUnmount(afterEach)

describe('NoteMarkdown（评审 I-6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    acquireMock.mockReset()
  })

  it('loads private photo images through the authenticated path', async () => {
    acquireMock.mockResolvedValue({ src: 'blob:mock-photo', release: releaseMock })
    const wrapper = mount(NoteMarkdown, {
      props: { note: '大门\n\n![大门](/api/photos/5/original)\n\n完。' },
    })
    await flushPromises()

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe('blob:mock-photo')
    expect(acquireMock).toHaveBeenCalledWith('/api/photos/5/original')
  })

  it('releases blob resources when unmounted', async () => {
    acquireMock.mockResolvedValue({ src: 'blob:mock-photo', release: releaseMock })
    const wrapper = mount(NoteMarkdown, {
      props: { note: '![x](/api/photos/5/thumbnail)' },
    })
    await flushPromises()
    expect(acquireMock).toHaveBeenCalled()

    wrapper.unmount()
    expect(releaseMock).toHaveBeenCalled()
  })

  it('rewrites private photo urls to token-scoped ones on the share page', async () => {
    acquireMock.mockResolvedValue({ src: 'blob:should-not-load', release: releaseMock })
    const wrapper = mount(NoteMarkdown, {
      props: { note: '![大门](/api/photos/5/original)', shareToken: 'TOKEN' },
    })
    await flushPromises()

    expect(wrapper.get('img').attributes('src')).toBe('/api/shares/view/TOKEN/photos/5/original')
    expect(acquireMock).not.toHaveBeenCalled()
  })

  it('leaves external images untouched', async () => {
    acquireMock.mockResolvedValue({ src: 'blob:should-not-load', release: releaseMock })
    const wrapper = mount(NoteMarkdown, {
      props: { note: '![外链](https://cdn.example.com/x.jpg)' },
    })
    await flushPromises()

    expect(wrapper.get('img').attributes('src')).toBe('https://cdn.example.com/x.jpg')
    expect(acquireMock).not.toHaveBeenCalled()
  })
})
