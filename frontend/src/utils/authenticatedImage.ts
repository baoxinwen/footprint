import request from '../api/request'

export interface ImageResource {
  src: string
  release: () => void
}

export function isPrivatePhotoUrl(src: string): boolean {
  try {
    const url = new URL(src, window.location.origin)
    return url.origin === window.location.origin && url.pathname.startsWith('/api/photos/')
  } catch {
    return false
  }
}

function getPrivatePhotoRequestPath(src: string): string {
  const url = new URL(src, window.location.origin)
  return `${url.pathname.slice('/api'.length)}${url.search}`
}

export async function acquireImageResource(src: string, signal?: AbortSignal): Promise<ImageResource> {
  if (!isPrivatePhotoUrl(src)) {
    return { src, release: () => undefined }
  }

  const response = await request.get<Blob>(getPrivatePhotoRequestPath(src), {
    responseType: 'blob',
    signal,
  })
  const objectUrl = URL.createObjectURL(response.data)
  let released = false

  return {
    src: objectUrl,
    release: () => {
      if (released) return
      released = true
      URL.revokeObjectURL(objectUrl)
    },
  }
}
