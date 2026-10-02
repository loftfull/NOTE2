export const MEDIA_JOB_VERSION = 1
export const MEDIA_JOB_STATES = Object.freeze({
  queued: 'queued',
  running: 'running',
  done: 'done',
  failed: 'failed',
  paused: 'paused'
})

export function createMediaJobRecord(file, overrides = {}) {
  if (!file) throw new Error('A media file is required')
  const now = Date.now()
  const id = overrides.id || globalThis.crypto?.randomUUID?.() || `job-${now}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    version: MEDIA_JOB_VERSION,
    type: 'transcription',
    status: MEDIA_JOB_STATES.queued,
    progress: 0,
    attempts: 0,
    filename: file.name || overrides.filename || 'media-upload',
    mimeType: file.type || overrides.mimeType || 'application/octet-stream',
    size: Number(file.size || overrides.size || 0),
    lastModified: Number(file.lastModified || overrides.lastModified || now),
    file,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

export function transitionMediaJob(job, status, patch = {}) {
  const next = { ...job, ...patch, status, updatedAt: Date.now() }
  if (status === MEDIA_JOB_STATES.running) {
    next.attempts = Number(job.attempts || 0) + 1
    next.progress = Math.max(0.05, Number(patch.progress ?? job.progress ?? 0))
    next.error = null
    next.startedAt = Date.now()
  }
  if (status === MEDIA_JOB_STATES.done) {
    next.progress = 1
    next.error = null
    next.completedAt = Date.now()
  }
  if (status === MEDIA_JOB_STATES.failed) {
    next.progress = Math.min(0.95, Number(patch.progress ?? job.progress ?? 0))
    next.error = String(patch.error || job.error || 'Job failed')
  }
  if (status === MEDIA_JOB_STATES.queued) next.progress = Math.min(0.95, Number(patch.progress ?? job.progress ?? 0))
  return next
}

export function isResumableMediaJob(job) {
  return Boolean(job?.file) && [MEDIA_JOB_STATES.queued, MEDIA_JOB_STATES.running].includes(job?.status)
}

export function retryMediaJob(job) {
  return transitionMediaJob(job, MEDIA_JOB_STATES.queued, { error: null, progress: 0 })
}
