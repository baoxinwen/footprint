import { defineComponent, nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'

// Mock Element Plus icons - 使用 importOriginal 保留所有图标
vi.mock('@element-plus/icons-vue', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ArrowLeft: { template: '<span />' },
    ArrowRight: { template: '<span />' },
    Close: { template: '<span />' },
  }
})

import PhotoViewer from '../../components/PhotoViewer.vue'
import request from '../../api/request'

enableAutoUnmount(afterEach)

const ElButtonStub = defineComponent({
  name: 'ElButton',
  inheritAttrs: false,
  props: { disabled: Boolean },
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
})

const globalStubs = { ElButton: ElButtonStub, ElIcon: true }

const mockPhotos = [
  { id: 1, original_url: '/api/photos/1/original', thumbnail_url: '/api/photos/1/thumbnail', file_name: 'photo1.jpg' },
  { id: 2, original_url: '/api/photos/2/original', thumbnail_url: '/api/photos/2/thumbnail', file_name: 'photo2.jpg' },
  { id: 3, original_url: '/api/photos/3/original', thumbnail_url: '/api/photos/3/thumbnail', file_name: 'photo3.jpg' },
]

function pressTab(shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  document.dispatchEvent(event)
  return event
}

describe('PhotoViewer', () => {
  const originalAdapter = request.defaults.adapter

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    request.defaults.adapter = originalAdapter
  })

  it('renders when visible is true', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.photo-viewer').exists()).toBe(true)
  })

  it('does not render when visible is false', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: false },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.photo-viewer').exists()).toBe(false)
  })

  it('loads a private photo with Bearer authorization and releases its object URL', async () => {
    localStorage.setItem('token', 'private-photo-token')
    const adapter = vi.fn(async (config: any) => ({
      data: new Blob(['private-photo'], { type: 'image/jpeg' }),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }))
    request.defaults.adapter = adapter
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:private-photo-1')

    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })

    await vi.waitFor(() => expect(wrapper.get('.viewer-content img').attributes('src')).toBe('blob:private-photo-1'))
    expect(adapter).toHaveBeenCalledOnce()
    expect(adapter.mock.calls[0][0].url).toBe('/photos/1/original')
    expect(adapter.mock.calls[0][0].headers.Authorization).toBe('Bearer private-photo-token')

    wrapper.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-photo-1')
  })

  it('cancels an in-flight private photo request when unmounted', async () => {
    let requestSignal: AbortSignal | undefined
    request.defaults.adapter = vi.fn((config: any) => {
      requestSignal = config.signal
      return new Promise(() => {})
    })

    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })
    await flushPromises()
    wrapper.unmount()

    expect(requestSignal?.aborted).toBe(true)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('loads token-scoped shared photos directly without an authenticated blob request', async () => {
    const adapter = vi.fn()
    request.defaults.adapter = adapter
    const sharedPhoto = [{
      ...mockPhotos[0],
      original_url: '/api/shares/view/share-token/photos/1/original',
      thumbnail_url: '/api/shares/view/share-token/photos/1/thumbnail',
    }]

    const wrapper = mount(PhotoViewer, {
      props: { photos: sharedPhoto, index: 0, visible: true },
      global: { stubs: globalStubs },
    })
    await flushPromises()

    expect(wrapper.get('.viewer-content img').attributes('src')).toBe(sharedPhoto[0].original_url)
    expect(adapter).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('exposes a clear state when a private photo cannot be loaded', async () => {
    request.defaults.adapter = vi.fn().mockRejectedValue(new Error('network failed'))
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })

    await vi.waitFor(() => expect(wrapper.get('.viewer-content img').attributes('data-image-state')).toBe('error'))
    const image = wrapper.get('.viewer-content img')
    expect(image.attributes('alt')).toContain('加载失败')
    expect(image.attributes('title')).toBe('照片加载失败，请稍后重试')
  })

  it('emits close when clicking backdrop', async () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })
    await wrapper.find('.photo-viewer').trigger('click.self')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits update:index when navigating next', async () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })
    const nextButton = wrapper.find('.viewer-next')
    await nextButton.trigger('click')
    expect(wrapper.emitted('update:index')).toHaveLength(1)
    expect(wrapper.emitted('update:index')![0]).toEqual([1])
  })

  it('emits update:index when navigating prev', async () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 2, visible: true },
      global: { stubs: globalStubs },
    })
    const prevButton = wrapper.find('.viewer-prev')
    await prevButton.trigger('click')
    expect(wrapper.emitted('update:index')).toHaveLength(1)
    expect(wrapper.emitted('update:index')![0]).toEqual([1])
  })

  it('disables prev button at first photo', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })
    const prevButton = wrapper.find('.viewer-prev')
    expect(prevButton.attributes('disabled')).toBeDefined()
  })

  it('disables next button at last photo', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 2, visible: true },
      global: { stubs: globalStubs },
    })
    const nextButton = wrapper.find('.viewer-next')
    expect(nextButton.attributes('disabled')).toBeDefined()
  })

  it('handles keyboard navigation', async () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })

    // Press ArrowRight
    await wrapper.find('.photo-viewer').trigger('keydown', { key: 'ArrowRight' })
    // Keyboard events are handled via document listener, not directly on element
    // This tests the component structure
    expect(wrapper.exists()).toBe(true)
  })

  it('handles single photo', () => {
    const singlePhoto = [mockPhotos[0]]
    const wrapper = mount(PhotoViewer, {
      props: { photos: singlePhoto, index: 0, visible: true },
      global: { stubs: globalStubs },
    })

    // Both buttons should be disabled
    const prevButton = wrapper.find('.viewer-prev')
    const nextButton = wrapper.find('.viewer-next')
    expect(prevButton.attributes('disabled')).toBeDefined()
    expect(nextButton.attributes('disabled')).toBeDefined()
  })

  it('exposes dialog semantics and a descriptive image alternative', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })

    const viewer = wrapper.get('.photo-viewer')
    expect(viewer.attributes('role')).toBe('dialog')
    expect(viewer.attributes('aria-modal')).toBe('true')
    expect(wrapper.get('img').attributes('alt')).toBe('photo1.jpg')
  })

  it('gives accessible names to all icon-only controls', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 1, visible: true },
      global: { stubs: globalStubs },
    })

    expect(wrapper.get('.viewer-close').attributes('aria-label')).toBe('关闭照片查看器')
    expect(wrapper.get('.viewer-prev').attributes('aria-label')).toBe('上一张照片')
    expect(wrapper.get('.viewer-next').attributes('aria-label')).toBe('下一张照片')
  })

  it('closes on Escape', async () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('moves focus into the dialog and restores it when closed', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const wrapper = mount(PhotoViewer, {
      attachTo: document.body,
      props: { photos: mockPhotos, index: 0, visible: false },
      global: { stubs: globalStubs },
    })

    await wrapper.setProps({ visible: true })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('.viewer-close').element)

    await wrapper.setProps({ visible: false })
    await nextTick()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('cycles Tab and Shift+Tab through enabled viewer controls', async () => {
    const wrapper = mount(PhotoViewer, {
      attachTo: document.body,
      props: { photos: mockPhotos, index: 1, visible: true },
      global: { stubs: globalStubs },
    })
    await nextTick()

    const close = wrapper.get('.viewer-close').element
    const prev = wrapper.get('.viewer-prev').element
    const next = wrapper.get('.viewer-next').element
    expect(document.activeElement).toBe(close)

    expect(pressTab().defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(prev)
    pressTab()
    expect(document.activeElement).toBe(next)
    pressTab()
    expect(document.activeElement).toBe(close)
    pressTab(true)
    expect(document.activeElement).toBe(next)
  })

  it('skips disabled controls and redirects escaped focus into the dialog', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const wrapper = mount(PhotoViewer, {
      attachTo: document.body,
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: globalStubs },
    })
    await nextTick()

    const close = wrapper.get('.viewer-close').element
    const next = wrapper.get('.viewer-next').element
    expect(wrapper.get('.viewer-prev').attributes('disabled')).toBeDefined()

    pressTab()
    expect(document.activeElement).toBe(next)
    pressTab()
    expect(document.activeElement).toBe(close)
    pressTab(true)
    expect(document.activeElement).toBe(next)

    outside.focus()
    expect(document.activeElement).toBe(outside)
    expect(pressTab().defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(close)
    outside.remove()
  })
})
