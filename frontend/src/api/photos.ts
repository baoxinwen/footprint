import request from './request'
import type { Photo } from '../types'

export function uploadPhoto(locationId: number, file: File, onProgress?: (p: number) => void) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post<Photo>(`/photos/upload/${locationId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (e.total && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    },
  })
}

export function getPhotos(locationId: number) {
  return request.get<Photo[]>(`/photos/location/${locationId}`)
}

export function deletePhoto(photoId: number) {
  return request.delete(`/photos/${photoId}`)
}
