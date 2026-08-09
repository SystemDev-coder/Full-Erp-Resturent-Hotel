import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, File as FileIcon, Trash2, Eye, Search,
  Loader2, AlertCircle, CheckCircle2, Database,
} from 'lucide-react'
import {
  deleteDataset, listDatasets, previewDataset, uploadDataset,
} from '@services/datasetService'
import { getApiErrorMessage } from '@services/api'
import { useToast } from '../contexts/ToastContext'
import { DatasetMeta, DatasetPreview } from '../types/dataset'

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmtSize = (size: number) => {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`
  if (size >= 1024)         return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

/* ── Component ───────────────────────────────────────────────────────────── */
const Datasets = () => {
  const [datasets, setDatasets]           = useState<DatasetMeta[]>([])
  const [file, setFile]                   = useState<File | null>(null)
  const [isLoading, setIsLoading]         = useState(false)
  const [isUploading, setIsUploading]     = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError]                 = useState<string | null>(null)
  const [success, setSuccess]             = useState<string | null>(null)
  const [dragActive, setDragActive]       = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [typeFilter, setTypeFilter]       = useState('All')
  const [preview, setPreview]             = useState<DatasetPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null)
  const { showToast } = useToast()

  const datasetTypes = useMemo(() => {
    const types = new Set<string>()
    datasets.forEach(d => types.add((d.type || d.filename.split('.').pop() || 'Unknown').toUpperCase()))
    return ['All', ...Array.from(types).sort()]
  }, [datasets])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return datasets.filter(d => {
      const fn  = d.filename.toLowerCase()
      const tp  = (d.type || d.filename.split('.').pop() || 'unknown').toLowerCase()
      return (!q || fn.includes(q)) && (typeFilter === 'All' || tp === typeFilter.toLowerCase())
    })
  }, [datasets, searchQuery, typeFilter])

  const totalSize = useMemo(() => datasets.reduce((s, d) => s + (d.size || 0), 0), [datasets])
  const totalRows = useMemo(() => datasets.reduce((s, d) => s + (d.rowCount || 0), 0), [datasets])

  const loadDatasets = async () => {
    setIsLoading(true); setError(null)
    try {
      const res = await listDatasets(); setDatasets(res.data)
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Unable to load datasets.')
      setError(msg); showToast(msg, 'error')
    } finally { setIsLoading(false) }
  }

  useEffect(() => { loadDatasets() }, [])

  const handleUpload = async () => {
    if (!file) return
    setError(null); setSuccess(null); setIsUploading(true); setUploadProgress(0)
    try {
      await uploadDataset(file, setUploadProgress)
      setSuccess('Dataset uploaded successfully.')
      showToast('Dataset uploaded successfully.', 'success')
      setFile(null); await loadDatasets()
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to upload dataset.')
      setError(msg); showToast(msg, 'error')
    } finally { setIsUploading(false) }
  }

  const handlePreview = async (dataset: DatasetMeta) => {
    setSelectedPreviewId(dataset.id); setPreviewLoading(true); setPreview(null); setError(null)
    try {
      const res = await previewDataset(dataset.id); setPreview(res.data)
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Unable to load dataset preview.')
      setError(msg); showToast(msg, 'error')
    } finally { setPreviewLoading(false) }
  }

  const handleDelete = async (dataset: DatasetMeta) => {
    if (!window.confirm(`Delete dataset "${dataset.filename}"?`)) return
    setError(null); setSuccess(null)
    try {
      await deleteDataset(dataset.id)
      setSuccess('Dataset removed successfully.')
      showToast('Dataset removed successfully.', 'success')
      if (selectedPreviewId === dataset.id) { setPreview(null); setSelectedPreviewId(null) }
      await loadDatasets()
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Unable to delete dataset.')
      setError(msg); showToast(msg, 'error')
    }
  }

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
    const f = e.dataTransfer.files?.[0]; if (f) setFile(f)
  }

  /* ─── Shared classes ─── */
  const cardCls = 'overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900'
  const hdrCls  = 'border-b border-neutral-100 px-6 py-4 dark:border-neutral-800'

  return (
    <div className="space-y-6 pb-12">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-cyan-700 to-sky-800 px-7 py-7 text-white shadow-xl"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-1/4 h-36 w-36 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-cyan-200">
              <Database size={12} /> Data Management
            </div>
            <h1 className="text-[1.75rem] font-extrabold tracking-tight leading-tight">Datasets</h1>
            <p className="mt-1 text-sm text-cyan-200/90">
              Upload CSV / Excel files, inspect metadata, and preview rows before training
            </p>
          </div>
          {!isLoading && (
            <div className="shrink-0 hidden sm:flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5">
              <Database size={14} className="text-cyan-300" />
              <span className="text-sm font-bold">{datasets.length} dataset{datasets.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Alerts ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-3 overflow-hidden rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-900/20">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p>
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-3 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/20">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{success}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main grid ────────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">

        {/* ── Left column ── */}
        <div className="space-y-6">

          {/* Upload card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={cardCls}>
            <div className={hdrCls}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Import</p>
                  <h2 className="mt-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-100">Upload Dataset</h2>
                </div>
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-700 dark:bg-teal-500/10 dark:text-teal-400">
                  {datasets.length} uploaded
                </span>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Drop zone */}
              <div
                onDragEnter={handleDrag} onDragLeave={handleDrag}
                onDragOver={handleDrag} onDrop={handleDrop}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors duration-200 ${
                  dragActive
                    ? 'border-teal-500 bg-teal-50/80 dark:bg-teal-900/20'
                    : 'border-neutral-200 bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-800/30'
                }`}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-neutral-800">
                  <Upload size={28} className="text-teal-600 dark:text-teal-400" />
                </div>
                <p className="mt-4 text-sm font-bold text-neutral-800 dark:text-neutral-100">Drag &amp; drop a file</p>
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">CSV, XLSX, XLS supported</p>
                <label htmlFor="dataset-file-input"
                  className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-700 shadow-sm transition-colors hover:border-teal-400 hover:text-teal-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-teal-500">
                  Browse File
                </label>
                <input id="dataset-file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>

              {/* Selected file */}
              <AnimatePresence>
                {file && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-800/40 dark:bg-teal-900/20">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/60">
                      <FileIcon size={18} className="text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">{file.name}</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{fmtSize(file.size)}</p>
                    </div>
                    <button onClick={() => setFile(null)}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800">
                      Remove
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Progress bar */}
              {isUploading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                    <span>Uploading…</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <motion.div
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ duration: 0.3 }}
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400"
                    />
                  </div>
                </div>
              )}

              {/* Upload button */}
              <button
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition-all hover:bg-teal-700 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
              >
                {isUploading
                  ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Uploading…</>
                  : <><Upload size={15} />{file ? 'Upload Dataset' : 'Choose a file to upload'}</>
                }
              </button>
            </div>
          </motion.div>

          {/* Library card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={cardCls}>
            <div className={hdrCls}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Library</p>
                  <h2 className="mt-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-100">Active Dataset Library</h2>
                </div>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search datasets…"
                    className="h-9 w-full sm:w-48 rounded-xl border border-neutral-200 bg-neutral-50 pl-8 pr-3 text-xs font-semibold text-neutral-800 placeholder-neutral-400 focus:border-teal-400 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Type filters */}
              <div className="flex flex-wrap gap-1.5">
                {datasetTypes.map(tp => (
                  <button key={tp} onClick={() => setTypeFilter(tp)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition-all border ${
                      typeFilter === tp
                        ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                    }`}>
                    {tp}
                  </button>
                ))}
              </div>

              {/* Dataset list */}
              {isLoading ? (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 py-10 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800/20">
                  <Loader2 size={18} className="mr-2 animate-spin" /> Loading datasets…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 py-10 text-center dark:border-neutral-700 dark:bg-neutral-800/20">
                  <FileIcon size={32} className="mb-3 text-neutral-300 dark:text-neutral-600" />
                  <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">No datasets found</p>
                  <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">Upload a file or adjust filters</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filtered.map(dataset => (
                    <motion.div key={dataset.id}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-3 rounded-xl border border-neutral-100 bg-white p-4 transition-colors hover:border-teal-200 dark:border-neutral-800 dark:bg-neutral-800/30 dark:hover:border-teal-700/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-500/10">
                          <FileIcon size={18} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-neutral-900 dark:text-white">{dataset.filename}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-500/10 dark:text-teal-400">
                              {dataset.type || 'CSV'}
                            </span>
                            <span>{fmtSize(dataset.size)}</span>
                            <span>{new Date(dataset.uploadedAt).toLocaleDateString()}</span>
                            {dataset.rowCount !== undefined && <span>{dataset.rowCount} rows</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button onClick={() => handlePreview(dataset)}
                          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-bold text-neutral-700 transition-colors hover:border-teal-300 hover:text-teal-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                          <Eye size={13} /> Preview
                        </button>
                        <button onClick={() => handleDelete(dataset)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20">
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">

          {/* Preview card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className={cardCls}>
            <div className={hdrCls}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Inspection</p>
              <h2 className="mt-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-100">Dataset Preview</h2>
            </div>

            <div className="px-6 py-5">
              {previewLoading ? (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 py-12 dark:border-neutral-700 dark:bg-neutral-800/20">
                  <Loader2 size={18} className="mr-2 animate-spin text-teal-500" />
                  <span className="text-sm font-medium text-neutral-400">Loading preview…</span>
                </div>
              ) : preview ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Previewing</p>
                      <p className="text-sm font-bold text-neutral-900 dark:text-white">{preview.filename}</p>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {preview.rows.length} rows
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-neutral-100 dark:border-neutral-800">
                    <table className="min-w-full divide-y divide-neutral-100 text-left text-xs dark:divide-neutral-800">
                      <thead className="bg-neutral-50 dark:bg-neutral-800/50">
                        <tr>
                          {preview.columns.map(col => (
                            <th key={col} className="px-4 py-3 font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 text-[10px]">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50 bg-white dark:divide-neutral-800/50 dark:bg-transparent">
                        {preview.rows.length > 0
                          ? preview.rows.map((row, ri) => (
                              <tr key={ri} className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/20">
                                {row.map((cell, ci) => (
                                  <td key={`${ri}-${ci}`} className="max-w-[160px] truncate px-4 py-3 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))
                          : <tr><td colSpan={preview.columns.length} className="px-4 py-8 text-center text-neutral-400">No rows available.</td></tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 py-12 text-center dark:border-neutral-700 dark:bg-neutral-800/20">
                  <FileIcon size={32} className="mb-3 text-neutral-300 dark:text-neutral-600" />
                  <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">No preview selected</p>
                  <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">Click Preview on a dataset to inspect it</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Insights card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className={cardCls}>
            <div className={hdrCls}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Stats</p>
              <h2 className="mt-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-100">Dataset Insights</h2>
            </div>
            <div className="px-6 py-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {[
                { label: 'Total Datasets', value: datasets.length },
                { label: 'Total Size',     value: fmtSize(totalSize) },
                { label: 'Total Rows',     value: totalRows.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/20">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{label}</p>
                  <p className="mt-1.5 text-3xl font-black text-neutral-900 dark:text-white">{value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default Datasets
