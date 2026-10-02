import test from 'node:test'
import assert from 'node:assert/strict'
import { createMediaJobRecord, isResumableMediaJob, MEDIA_JOB_STATES, retryMediaJob, transitionMediaJob } from '../src/job-core.js'

test('media jobs are durable-state records with explicit transitions', () => {
  const file = new File([new Uint8Array([1,2,3])], 'clip.webm', { type: 'audio/webm' })
  const queued = createMediaJobRecord(file, { id: 'job-1' })
  assert.equal(queued.status, MEDIA_JOB_STATES.queued)
  assert.equal(queued.filename, 'clip.webm')
  assert.equal(isResumableMediaJob(queued), true)

  const running = transitionMediaJob(queued, MEDIA_JOB_STATES.running)
  assert.equal(running.attempts, 1)
  assert.equal(running.error, null)
  assert.equal(isResumableMediaJob(running), true)

  const done = transitionMediaJob(running, MEDIA_JOB_STATES.done, { result: { text: 'hello' } })
  assert.equal(done.progress, 1)
  assert.equal(done.result.text, 'hello')
  assert.equal(isResumableMediaJob(done), false)
})

test('failed media job can be explicitly re-queued', () => {
  const file = new File([new Uint8Array([1])], 'clip.webm', { type: 'audio/webm' })
  const failed = transitionMediaJob(createMediaJobRecord(file, { id:'job-2' }), MEDIA_JOB_STATES.failed, { error:'network error', progress:0.2 })
  const retried = retryMediaJob(failed)
  assert.equal(retried.status, MEDIA_JOB_STATES.queued)
  assert.equal(retried.error, null)
  assert.equal(retried.progress, 0)
})
