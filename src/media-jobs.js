import { createMediaJobRecord, isResumableMediaJob, MEDIA_JOB_STATES, retryMediaJob, transitionMediaJob } from './job-core.js'
import { deleteJob, getJob, listJobs, saveJob } from './source-db.js'
import { DIRECT_TRANSCRIBE_LIMIT, transcribeMediaFile } from './media-api.js'
import { transcribeMediaResumable } from './resumable-upload.js'

function jobFile(job) {
  if (!job?.file) throw new Error('The queued media file is no longer available.')
  if (typeof File !== 'undefined' && job.file instanceof File) return job.file
  return new File([job.file], job.filename || 'media-upload', { type: job.mimeType || job.file.type || 'application/octet-stream', lastModified: job.lastModified || Date.now() })
}

export async function enqueueMediaTranscription(file) {
  const job = createMediaJobRecord(file)
  await saveJob(job)
  return job
}

export async function runMediaTranscriptionJob(jobOrId, endpoint = '/api/transcribe', onUpdate) {
  let job = typeof jobOrId === 'string' ? await getJob(jobOrId) : jobOrId
  if (!job) throw new Error('Media job not found')
  job = transitionMediaJob(job, MEDIA_JOB_STATES.running, { progress: 0.12 })
  await saveJob(job); onUpdate?.(job)
  try {
    const file = jobFile(job)
    let result
    if (file.size > DIRECT_TRANSCRIBE_LIMIT) {
      let persist = Promise.resolve()
      job = { ...job, transport: 'resumable', progress: Math.max(job.progress || 0, 0.06) }
      await saveJob(job); onUpdate?.(job)
      result = await transcribeMediaResumable(file, job.id, endpoint, info => {
        const raw = Math.max(0, Math.min(1, Number(info.progress || 0)))
        const progress = info.phase === 'upload' ? 0.06 + raw * 0.39 : Math.max(0.46, raw)
        job = { ...job, progress: Math.min(0.98, progress), upload: info.session ? { uploadId: info.session.uploadId, phase: info.phase, status: info.session.status, received: info.session.received?.length || 0, totalChunks: info.session.totalChunks || 0 } : job.upload, updatedAt: Date.now() }
        persist = persist.then(() => saveJob(job)).catch(() => {})
        onUpdate?.(job)
      })
      await persist
    } else {
      job = { ...job, transport: 'direct' }
      await saveJob(job); onUpdate?.(job)
      result = await transcribeMediaFile(file, endpoint)
    }
    job = transitionMediaJob(job, MEDIA_JOB_STATES.done, { result, progress: 1 })
    await saveJob(job); onUpdate?.(job)
    return job
  } catch (error) {
    job = transitionMediaJob(job, MEDIA_JOB_STATES.failed, { error: error.message || 'Transcription failed', progress: 0.2 })
    await saveJob(job); onUpdate?.(job)
    throw Object.assign(error, { job })
  }
}

export async function resumeInterruptedMediaJobs(endpoint = '/api/transcribe', onUpdate) {
  const jobs = await listJobs()
  const interrupted = jobs.filter(isResumableMediaJob)
  const results = []
  for (const item of interrupted) {
    try { results.push(await runMediaTranscriptionJob(item, endpoint, onUpdate)) }
    catch (error) { results.push(error.job || item) }
  }
  return results
}


export async function recoverInterruptedMediaJobs() {
  const jobs = await listJobs()
  const recovered = []
  for (const job of jobs) {
    if (job.status !== MEDIA_JOB_STATES.running) continue
    const queued = transitionMediaJob(job, MEDIA_JOB_STATES.queued, { error: 'Interrupted before completion. Ready to resume.', progress: job.progress || 0 })
    await saveJob(queued)
    recovered.push(queued)
  }
  return recovered
}

export async function retryQueuedMediaJob(id, endpoint = '/api/transcribe', onUpdate) {
  const existing = await getJob(id)
  if (!existing) throw new Error('Media job not found')
  const queued = retryMediaJob(existing)
  await saveJob(queued); onUpdate?.(queued)
  return runMediaTranscriptionJob(queued, endpoint, onUpdate)
}

export { deleteJob, getJob, listJobs }
