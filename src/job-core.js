// Media transcription job state, reconstructed from its call sites in
// media-jobs.js after the original file was lost with the v4.10 upload.
//
// Everything here is pure: no IndexedDB, no fetch. media-jobs.js owns
// persistence (source-db.js) and transport, which keeps the state machine
// testable on its own and is why the queue survives a process restart —
// recoverInterruptedMediaJobs() can reason about a stored record without
// replaying any I/O.

export const MEDIA_JOB_STATES = {
  queued: 'queued',
  running: 'running',
  done: 'done',
  failed: 'failed'
}

const TERMINAL = new Set([MEDIA_JOB_STATES.done])

function jobId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `job_${crypto.randomUUID()}`
  } catch { /* fall through to the counter below */ }
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function createMediaJobRecord(file) {
  if (!file) throw new Error('A media file is required to queue transcription.')
  const now = Date.now()
  return {
    id: jobId(),
    file,
    filename: file.name || 'media-upload',
    mimeType: file.type || 'application/octet-stream',
    size: Number(file.size || 0),
    lastModified: Number(file.lastModified || now),
    status: MEDIA_JOB_STATES.queued,
    progress: 0,
    transport: null,
    upload: null,
    result: null,
    error: null,
    attempts: 0,
    createdAt: now,
    updatedAt: now
  }
}

export function transitionMediaJob(job, status, patch = {}) {
  if (!job) throw new Error('Media job is required')
  if (!Object.values(MEDIA_JOB_STATES).includes(status)) throw new Error(`Unknown media job state: ${status}`)
  const next = {
    ...job,
    ...patch,
    status,
    attempts: status === MEDIA_JOB_STATES.running ? Number(job.attempts || 0) + 1 : Number(job.attempts || 0),
    updatedAt: Date.now()
  }
  // Entering a non-failed state clears any stale error text, so a retry that
  // succeeds does not keep showing the message from the attempt before it.
  if (status !== MEDIA_JOB_STATES.failed && !('error' in patch)) next.error = null
  if (status === MEDIA_JOB_STATES.done) next.progress = 1
  return next
}

// A job is worth resuming when it was never finished and the File is still in
// hand. Files do not survive a page reload, so a queued record whose blob is
// gone is reported as not resumable rather than failing later inside jobFile().
export function isResumableMediaJob(job) {
  if (!job || TERMINAL.has(job.status)) return false
  if (!job.file) return false
  return job.status === MEDIA_JOB_STATES.queued
    || job.status === MEDIA_JOB_STATES.running
    || job.status === MEDIA_JOB_STATES.failed
}

export function retryMediaJob(job) {
  if (!job) throw new Error('Media job is required')
  // Keep whatever upload session exists: resumable transfers continue from the
  // chunks the gateway already has instead of re-uploading the whole file.
  return transitionMediaJob(job, MEDIA_JOB_STATES.queued, {
    error: null,
    result: null,
    progress: job.upload ? Number(job.progress || 0) : 0
  })
}
