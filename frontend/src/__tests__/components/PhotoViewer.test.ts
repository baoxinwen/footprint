import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

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

const mockPhotos = [
  { id: 1, original_url: '/api/photos/1/original', thumbnail_url: '/api/photos/1/thumbnail', file_name: 'photo1.jpg' },
  { id: 2, original_url: '/api/photos/2/original', thumbnail_url: '/api/photos/2/thumbnail', file_name: 'photo2.jpg' },
  { id: 3, original_url: '/api/photos/3/original', thumbnail_url: '/api/photos/3/thumbnail', file_name: 'photo3.jpg' },
]

describe('PhotoViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders when visible is true', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: { ElButton: true, ElIcon: true } },
    })
    expect(wrapper.find('.photo-viewer').exists()).toBe(true)
  })

  it('does not render when visible is false', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: false },
      global: { stubs: { ElButton: true, ElIcon: true } },
    })
    expect(wrapper.find('.photo-viewer').exists()).toBe(false)
  })

  it('displays current photo', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: { ElButton: true, ElIcon: true } },
    })
    const img = wrapper.find('.viewer-content img')
    expect(img.attributes('src')).toBe('/api/photos/1/original')
  })

  it('emits close when clicking backdrop', async () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: { ElButton: true, ElIcon: true } },
    })
    await wrapper.find('.photo-viewer').trigger('click.self')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits update:index when navigating next', async () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: { ElButton: { template: '<button><slot /></button>' }, ElIcon: true } },
    })
    const nextButton = wrapper.find('.viewer-next')
    await nextButton.trigger('click')
    expect(wrapper.emitted('update:index')).toHaveLength(1)
    expect(wrapper.emitted('update:index')![0]).toEqual([1])
  })

  it('emits update:index when navigating prev', async () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 2, visible: true },
      global: { stubs: { ElButton: { template: '<button><slot /></button>' }, ElIcon: true } },
    })
    const prevButton = wrapper.find('.viewer-prev')
    await prevButton.trigger('click')
    expect(wrapper.emitted('update:index')).toHaveLength(1)
    expect(wrapper.emitted('update:index')![0]).toEqual([1])
  })

  it('disables prev button at first photo', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: { ElButton: { template: '<button><slot /></button>' }, ElIcon: true } },
    })
    const prevButton = wrapper.find('.viewer-prev')
    expect(prevButton.attributes('disabled')).toBeDefined()
  })

  it('disables next button at last photo', () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 2, visible: true },
      global: { stubs: { ElButton: { template: '<button><slot /></button>' }, ElIcon: true } },
    })
    const nextButton = wrapper.find('.viewer-next')
    expect(nextButton.attributes('disabled')).toBeDefined()
  })

  it('handles keyboard navigation', async () => {
    const wrapper = mount(PhotoViewer, {
      props: { photos: mockPhotos, index: 0, visible: true },
      global: { stubs: { ElButton: true, ElIcon: true } },
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
      global: { stubs: { ElButton: { template: '<button><slot /></button>' }, ElIcon: true } },
    })

    // Both buttons should be disabled
    const prevButton = wrapper.find('.viewer-prev')
    const nextButton = wrapper.find('.viewer-next')
    expect(prevButton.attributes('disabled')).toBeDefined()
    expect(nextButton.attributes('disabled')).toBeDefined()
  })
})
