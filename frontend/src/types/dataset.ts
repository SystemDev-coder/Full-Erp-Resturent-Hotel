export interface DatasetMeta {
  id: string
  filename: string
  size: number
  type: string
  uploadedAt: string
  rowCount?: number
  columnCount?: number
}

export interface DatasetPreview {
  id: string
  filename: string
  columns: string[]
  rows: string[][]
}
