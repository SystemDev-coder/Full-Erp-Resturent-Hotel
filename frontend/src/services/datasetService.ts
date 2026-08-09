import api from '@services/api'
import type { DatasetMeta, DatasetPreview } from '@/types/dataset'

export const listDatasets = () => api.get<DatasetMeta[]>('/datasets')

export const uploadDataset = (
  file: File,
  onUploadProgress?: (progress: number) => void
) => {
  const formData = new FormData()
  formData.append('file', file)

  return api.post('/datasets/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (event) => {
      if (event.total) {
        const percent = Math.round((event.loaded / event.total) * 100)
        onUploadProgress?.(percent)
      }
    },
  })
}

export const previewDataset = (id: string) => api.get<DatasetPreview>(`/datasets/${id}/preview`)

export const deleteDataset = (id: string) => api.delete(`/datasets/${id}`)
