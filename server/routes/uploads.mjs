// /api/uploads/* — chunked, resumable upload for media too large to post in
// one request, followed by transcription of the assembled file.
//
// The client's contract (resumable-upload.js) is: init, PUT each chunk, POST
// transcribe, then poll until status is done or failed. Init with a resumeKey
// that is already known returns the chunks the server already has, so a
// dropped connection costs the remaining chunks rather than the whole file.
//
// Session metadata is written to disk on every change. A gateway restarted
// mid-transcription comes back with the chunks intact and reports
// phase:'recovered', which the client answers by starting transcription again
// — the one recovery path that does not silently lose a 200 MB upload.

import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import { normalizeTranscription } from '../../media-connectors.mjs'
import { HttpError, readBody, requestFilename } from '../http.mjs'
import { transcribeConfigured } from '../config.mjs'
import { transcribeAudio } from '../upstream.mjs'
import { extractionQuality } from './media.mjs'
import { withLock } from '../store.mjs'

export const CHUNK_BYTES = 6 * 1024 * 1024

/** A stable id for a resumeKey, so the same file resumes rather than restarts. */
export function uploadIdFor(resumeKey = '') {
  const key = String(resumeKey || '').trim()
  if (!key) return randomUUID().replace(/-/g, '')
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

function assertUploadId(value) {
  const id = String(value || '')
  // Only ids the server could have issued. This value indexes a directory.
  if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpError(400, 'Некорректный идентификатор загрузки')
  return id
}

export function createUploadManager(config) {
  const root = resolve(join(config.dataDir, 'uploads'))

  function dirFor(uploadId) {
    const path = resolve(join(root, assertUploadId(uploadId)))
    if (!path.startsWith(root + sep)) throw new HttpError(400, 'Некорректный путь загрузки')
    return path
  }
  const metaPath = uploadId => join(dirFor(uploadId), 'session.json')
  const chunkPath = (uploadId, index) => join(dirFor(uploadId), `chunk-${String(index).padStart(6, '0')}`)

  async function readSession(uploadId) {
    try {
      return JSON.parse(await readFile(metaPath(uploadId), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }

  async function writeSession(session) {
    await mkdir(dirFor(session.uploadId), { recursive: true })
    await writeFile(metaPath(session.uploadId), JSON.stringify(session, null, 2), 'utf8')
    return session
  }

  /** Which chunk indices are actually on disk, at their expected size. */
  async function receivedChunks(uploadId, totalChunks, size) {
    let names
    try { names = await readdir(dirFor(uploadId)) } catch { return [] }
    const present = []
    for (const name of names) {
      const match = /^chunk-(\d{6})$/.exec(name)
      if (!match) continue
      const index = Number(match[1])
      if (index >= totalChunks) continue
      // A chunk truncated by a dropped connection must not count as received,
      // or the assembled file is silently corrupt.
      const expected = index === totalChunks - 1 ? size - index * CHUNK_BYTES : CHUNK_BYTES
      try {
        const info = await stat(join(dirFor(uploadId), name))
        if (info.size === expected) present.push(index)
      } catch { /* vanished between readdir and stat */ }
    }
    return present.sort((a, b) => a - b)
  }

  function publicSession(session, received) {
    const total = session.totalChunks || 1
    return {
      uploadId: session.uploadId,
      filename: session.filename,
      size: session.size,
      mimeType: session.mimeType,
      chunkSize: CHUNK_BYTES,
      totalChunks: session.totalChunks,
      received,
      status: session.status,
      phase: session.phase,
      progress: session.status === 'done' ? 1 : Number((received.length / total).toFixed(4)),
      ...(session.result ? { result: session.result } : {}),
      ...(session.error ? { error: session.error } : {})
    }
  }

  return {
    root,

    async init({ resumeKey, filename, size, mimeType }) {
      const bytes = Number(size)
      if (!Number.isFinite(bytes) || bytes <= 0) throw new HttpError(400, 'Некорректный размер файла')
      const limit = config.limits.uploadBytes * 32
      if (bytes > limit) throw new HttpError(413, `Файл больше допустимых ${Math.round(limit / 1024 / 1024)} МБ`)

      const uploadId = uploadIdFor(resumeKey)
      const totalChunks = Math.max(1, Math.ceil(bytes / CHUNK_BYTES))

      return withLock(`upload:${uploadId}`, async () => {
        const existing = await readSession(uploadId)
        if (existing && existing.size === bytes) {
          const received = await receivedChunks(uploadId, existing.totalChunks, existing.size)
          // A job interrupted by a restart: the chunks survived, the work did
          // not. Reported so the client restarts the transcription.
          if (existing.status === 'processing' || existing.status === 'queued') {
            const recovered = await writeSession({ ...existing, status: 'ready', phase: 'recovered' })
            return publicSession(recovered, received)
          }
          return publicSession(existing, received)
        }

        // A different file under the same resumeKey: start clean rather than
        // mixing chunks of two files into one.
        if (existing) await rm(dirFor(uploadId), { recursive: true, force: true })

        const session = await writeSession({
          uploadId,
          filename: String(filename || 'media').split(/[\\/]/).pop().slice(0, 255) || 'media',
          size: bytes,
          mimeType: String(mimeType || 'application/octet-stream').slice(0, 120),
          totalChunks,
          status: 'uploading',
          phase: 'upload',
          createdAt: new Date().toISOString()
        })
        return publicSession(session, [])
      })
    },

    async putChunk({ uploadId, index, bytes }) {
      const id = assertUploadId(uploadId)
      return withLock(`upload:${id}`, async () => {
        const session = await readSession(id)
        if (!session) throw new HttpError(404, 'Загрузка не найдена')
        const position = Number(index)
        if (!Number.isInteger(position) || position < 0 || position >= session.totalChunks) {
          throw new HttpError(400, 'Некорректный номер фрагмента')
        }
        const expected = position === session.totalChunks - 1
          ? session.size - position * CHUNK_BYTES
          : CHUNK_BYTES
        if (bytes.length !== expected) {
          throw new HttpError(400, `Фрагмент ${position} должен быть ${expected} байт, получено ${bytes.length}`)
        }
        await mkdir(dirFor(id), { recursive: true })
        await writeFile(chunkPath(id, position), bytes)

        const received = await receivedChunks(id, session.totalChunks, session.size)
        const complete = received.length === session.totalChunks
        const next = await writeSession({
          ...session,
          status: complete ? 'ready' : 'uploading',
          phase: complete ? 'ready' : 'upload'
        })
        return publicSession(next, received)
      })
    },

    async status(uploadId) {
      const id = assertUploadId(uploadId)
      const session = await readSession(id)
      if (!session) throw new HttpError(404, 'Загрузка не найдена')
      return publicSession(session, await receivedChunks(id, session.totalChunks, session.size))
    },

    async remove(uploadId) {
      const id = assertUploadId(uploadId)
      await rm(dirFor(id), { recursive: true, force: true })
      return { ok: true }
    },

    /** Assembles the chunks and transcribes. Runs to completion, then polls see it. */
    async transcribe(uploadId) {
      if (!transcribeConfigured(config)) {
        throw new HttpError(503, 'Расшифровка не настроена. Задайте NOTE2_TRANSCRIBE_BASE_URL и NOTE2_TRANSCRIBE_MODEL.')
      }
      const id = assertUploadId(uploadId)

      const session = await withLock(`upload:${id}`, async () => {
        const current = await readSession(id)
        if (!current) throw new HttpError(404, 'Загрузка не найдена')
        const received = await receivedChunks(id, current.totalChunks, current.size)
        if (received.length !== current.totalChunks) {
          throw new HttpError(409, `Загружено ${received.length} из ${current.totalChunks} фрагментов`)
        }
        if (current.status === 'processing') return current
        return writeSession({ ...current, status: 'processing', phase: 'transcribe' })
      })
      if (session.status === 'done') return publicSession(session, [])

      try {
        const parts = []
        for (let index = 0; index < session.totalChunks; index += 1) {
          parts.push(await readFile(chunkPath(id, index)))
        }
        const payload = await transcribeAudio({
          baseUrl: config.transcribe.baseUrl,
          apiKey: config.transcribe.apiKey,
          model: config.transcribe.model,
          bytes: Buffer.concat(parts),
          filename: session.filename,
          mimeType: session.mimeType,
          timeoutMs: config.limits.upstreamTimeoutMs
        })
        const normalized = normalizeTranscription(payload)
        const result = {
          ...normalized,
          quality: extractionQuality(normalized.text),
          model: config.transcribe.model,
          diarized: normalized.speakers.length > 1,
          segmented: normalized.sections.length > 1,
          segmentCount: normalized.sections.length,
          speakerContinuity: normalized.speakers.length ? 'labelled' : 'none',
          transcribedAt: new Date().toISOString(),
          filename: session.filename
        }
        const done = await withLock(`upload:${id}`, () => writeSession({ ...session, status: 'done', phase: 'done', result }))
        return publicSession(done, Array.from({ length: session.totalChunks }, (_, i) => i))
      } catch (error) {
        // Recorded on the session so a poll reports the reason rather than
        // spinning until the client's own timeout.
        const failed = await withLock(`upload:${id}`, () => writeSession({
          ...session, status: 'failed', phase: 'failed', error: error?.message || 'Расшифровка не удалась'
        }))
        return publicSession(failed, [])
      }
    }
  }
}

// --- route handlers ---------------------------------------------------------

export async function handleUploadInit({ body, uploads }) {
  return uploads.init({
    resumeKey: body?.resumeKey,
    filename: body?.filename,
    size: body?.size,
    mimeType: body?.mimeType
  })
}

export async function handleUploadChunk({ req, params, config, uploads }) {
  const bytes = await readBody(req, CHUNK_BYTES + 1024)
  return uploads.putChunk({ uploadId: params.uploadId, index: params.index, bytes })
}

export async function handleUploadStatus({ params, uploads }) {
  return uploads.status(params.uploadId)
}

export async function handleUploadDelete({ params, uploads }) {
  return uploads.remove(params.uploadId)
}

export async function handleUploadTranscribe({ params, uploads }) {
  return uploads.transcribe(params.uploadId)
}

export { requestFilename }
