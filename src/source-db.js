// IndexedDB Source Vault, reconstructed from its call sites across App.jsx,
// instagram-offline.js and media-jobs.js after the original was lost with the
// v4.10 upload.
//
// Store layout:
//   sources        keyPath 'id'
//   chunks         keyPath ['sourceId','index'], index 'bySource'
//   offlineAssets  keyPath ['sourceId','index'], index 'bySource'
//   jobs           keyPath 'id'
//
// Every write that spans stores runs in ONE transaction. That matters here:
// a source whose chunks were only half-written is worse than no source at all,
// because rankChunks() would silently retrieve a partial document and cite it
// as if it were complete. Grouping the writes means a crash mid-save rolls the
// whole thing back instead of leaving torn evidence behind.

const DB_NAME = 'noteai-sources'
const DB_VERSION = 3

let dbPromise = null

function idb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available in this environment.'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = event => {
      const db = request.result
      const from = event.oldVersion || 0
      // Upgrades are additive and ordered, so a vault created at any earlier
      // version reaches the current layout without losing stored rows.
      if (from < 1) {
        db.createObjectStore('sources', { keyPath: 'id' })
        const chunks = db.createObjectStore('chunks', { keyPath: ['sourceId', 'index'] })
        chunks.createIndex('bySource', 'sourceId', { unique: false })
      }
      if (from < 2) {
        const assets = db.createObjectStore('offlineAssets', { keyPath: ['sourceId', 'index'] })
        assets.createIndex('bySource', 'sourceId', { unique: false })
      }
      if (from < 3) {
        db.createObjectStore('jobs', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      // A newer tab upgrading the schema would otherwise block forever.
      request.result.onversionchange = () => { try { request.result.close() } catch {} ; dbPromise = null }
      resolve(request.result)
    }
    request.onerror = () => reject(request.error || new Error('Could not open the source vault.'))
    request.onblocked = () => reject(new Error('The source vault is blocked by another open tab.'))
  })
  return dbPromise
}

function run(storeNames, mode, work) {
  return idb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode)
    let outcome
    tx.oncomplete = () => resolve(outcome)
    tx.onerror = () => reject(tx.error || new Error('Source vault transaction failed.'))
    tx.onabort = () => reject(tx.error || new Error('Source vault transaction aborted.'))
    const stores = Array.isArray(storeNames)
      ? Object.fromEntries(storeNames.map(name => [name, tx.objectStore(name)]))
      : { [storeNames]: tx.objectStore(storeNames) }
    try {
      outcome = work(stores, tx)
    } catch (error) {
      try { tx.abort() } catch {}
      reject(error)
    }
  }))
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function collect(store, query) {
  return wrap(query === undefined ? store.getAll() : store.getAll(query))
}

// --- sources and chunks ---------------------------------------------------

export async function listSources() {
  const rows = await run('sources', 'readonly', s => collect(s.sources))
  const out = await rows
  return (out || []).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
}

export async function listChunks(sourceIds) {
  if (sourceIds !== undefined && !Array.isArray(sourceIds)) throw new TypeError('listChunks expects an array of source ids')
  if (Array.isArray(sourceIds) && !sourceIds.length) return []
  const rows = await run('chunks', 'readonly', s => {
    if (!Array.isArray(sourceIds)) return collect(s.chunks)
    const index = s.chunks.index('bySource')
    return Promise.all(sourceIds.map(id => collect(index, IDBKeyRange.only(id))))
      .then(groups => groups.flat())
  })
  const out = await rows
  return out || []
}

// Chunks arrive from chunkSections() without a sourceId, so stamp it here.
// rankChunks() resolves a chunk back to its source through this field, and an
// unstamped chunk would surface in search with no attributable origin.
function stampChunks(sourceId, chunks) {
  return (chunks || []).map((chunk, position) => ({
    ...chunk,
    sourceId,
    index: Number.isFinite(Number(chunk.index)) ? Number(chunk.index) : position
  }))
}

function replaceChunksFor(stores, sourceId, chunks) {
  const index = stores.chunks.index('bySource')
  // Clear the previous generation first; re-indexing a source with fewer
  // chunks than before must not leave the tail of the old run behind.
  return wrap(index.getAllKeys(IDBKeyRange.only(sourceId))).then(keys => {
    for (const key of keys || []) stores.chunks.delete(key)
    for (const chunk of stampChunks(sourceId, chunks)) stores.chunks.put(chunk)
  })
}

export async function saveSourceWithChunks(source, chunks = []) {
  if (!source?.id) throw new Error('A source id is required')
  const record = { createdAt: Date.now(), ...source, updatedAt: Date.now() }
  await run(['sources', 'chunks'], 'readwrite', stores => {
    stores.sources.put(record)
    return replaceChunksFor(stores, source.id, chunks)
  })
  return record
}

// Wholesale replace, used when a sync pull brings down a remote snapshot.
// One transaction again: a half-applied pull would mix two workspace states.
export async function replaceSourcesWithChunks(sources = [], chunks = []) {
  const grouped = new Map()
  for (const chunk of chunks || []) {
    if (!grouped.has(chunk.sourceId)) grouped.set(chunk.sourceId, [])
    grouped.get(chunk.sourceId).push(chunk)
  }
  await run(['sources', 'chunks'], 'readwrite', stores => {
    stores.sources.clear()
    stores.chunks.clear()
    for (const source of sources || []) {
      if (!source?.id) continue
      stores.sources.put(source)
      const own = (grouped.get(source.id) || []).sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      for (const chunk of stampChunks(source.id, own)) stores.chunks.put(chunk)
    }
  })
  return { sources: (sources || []).length, chunks: (chunks || []).length }
}

// Read-modify-write inside a single transaction, so two concurrent metadata
// edits (say, adding a collection while a pin completes) cannot clobber each
// other by both writing a value they read before the other's update landed.
export async function updateSourceMetadata(id, updater) {
  if (!id) throw new Error('A source id is required')
  if (typeof updater !== 'function') throw new TypeError('updateSourceMetadata expects an updater function')
  let saved = null
  await run('sources', 'readwrite', stores => wrap(stores.sources.get(id)).then(current => {
    if (!current) throw new Error('Source not found')
    const next = updater(current)
    if (!next?.id) throw new Error('The updater must return a source record')
    saved = { ...next, updatedAt: Date.now() }
    stores.sources.put(saved)
  }))
  return saved
}

export async function deleteSource(id) {
  if (!id) throw new Error('A source id is required')
  await run(['sources', 'chunks', 'offlineAssets'], 'readwrite', stores => {
    stores.sources.delete(id)
    const dropBySource = store => wrap(store.index('bySource').getAllKeys(IDBKeyRange.only(id)))
      .then(keys => { for (const key of keys || []) store.delete(key) })
    // Offline blobs go with the source; orphaned media would otherwise hold
    // storage quota that nothing in the UI can reach or free.
    return Promise.all([dropBySource(stores.chunks), dropBySource(stores.offlineAssets)])
  })
  return true
}

export async function clearSourceDb() {
  await run(['sources', 'chunks', 'offlineAssets', 'jobs'], 'readwrite', stores => {
    stores.sources.clear()
    stores.chunks.clear()
    stores.offlineAssets.clear()
    stores.jobs.clear()
  })
  return true
}

// --- offline media assets -------------------------------------------------

export async function putOfflineAsset({ sourceId, index, blob, contentType = '', bytes = 0 }) {
  if (!sourceId) throw new Error('A source id is required')
  if (!blob) throw new Error('An asset blob is required')
  const record = {
    sourceId,
    index: Number(index) || 0,
    blob,
    contentType: contentType || blob.type || '',
    bytes: Number(bytes || blob.size || 0),
    pinnedAt: Date.now()
  }
  await run('offlineAssets', 'readwrite', stores => { stores.offlineAssets.put(record) })
  return record
}

export async function getOfflineAsset(sourceId, index) {
  if (!sourceId) return null
  const row = await run('offlineAssets', 'readonly', stores => wrap(stores.offlineAssets.get([sourceId, Number(index) || 0])))
  return (await row) || null
}

export async function deleteOfflineAssetsForSource(sourceId) {
  if (!sourceId) return false
  await run('offlineAssets', 'readwrite', stores => wrap(stores.offlineAssets.index('bySource').getAllKeys(IDBKeyRange.only(sourceId)))
    .then(keys => { for (const key of keys || []) stores.offlineAssets.delete(key) }))
  return true
}

// --- media jobs -----------------------------------------------------------

export async function saveJob(job) {
  if (!job?.id) throw new Error('A job id is required')
  await run('jobs', 'readwrite', stores => { stores.jobs.put(job) })
  return job
}

export async function getJob(id) {
  if (!id) return null
  const row = await run('jobs', 'readonly', stores => wrap(stores.jobs.get(id)))
  return (await row) || null
}

export async function listJobs() {
  const rows = await run('jobs', 'readonly', stores => collect(stores.jobs))
  const out = await rows
  return (out || []).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
}

export async function deleteJob(id) {
  if (!id) return false
  await run('jobs', 'readwrite', stores => { stores.jobs.delete(id) })
  return true
}
