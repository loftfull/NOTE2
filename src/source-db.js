const DB_NAME = 'noteai-v3-sources'
const DB_VERSION = 3
const SOURCE_STORE = 'sources'
const CHUNK_STORE = 'chunks'
const JOB_STORE = 'jobs'
const OFFLINE_STORE = 'offlineAssets'

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
  })
}

export function openSourceDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available in this browser'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SOURCE_STORE)) {
        const store = db.createObjectStore(SOURCE_STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
        store.createIndex('kind', 'kind')
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const store = db.createObjectStore(CHUNK_STORE, { keyPath: 'id' })
        store.createIndex('sourceId', 'sourceId')
      }
      if (!db.objectStoreNames.contains(JOB_STORE)) {
        const store = db.createObjectStore(JOB_STORE, { keyPath: 'id' })
        store.createIndex('status', 'status')
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        const store = db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' })
        store.createIndex('sourceId', 'sourceId')
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Unable to open source database'))
  })
}

export async function listSources() {
  const db = await openSourceDb()
  const tx = db.transaction(SOURCE_STORE, 'readonly')
  const rows = await requestResult(tx.objectStore(SOURCE_STORE).getAll())
  db.close()
  return rows.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
}

export async function getSource(id) {
  const db = await openSourceDb()
  const tx = db.transaction(SOURCE_STORE, 'readonly')
  const row = await requestResult(tx.objectStore(SOURCE_STORE).get(id))
  db.close()
  return row || null
}

async function chunkKeysForSource(db, sourceId) {
  const tx = db.transaction(CHUNK_STORE, 'readonly')
  return requestResult(tx.objectStore(CHUNK_STORE).index('sourceId').getAllKeys(sourceId))
}

export async function saveSourceWithChunks(source, chunks = []) {
  const db = await openSourceDb()
  const existingKeys = await chunkKeysForSource(db, source.id)
  const tx = db.transaction([SOURCE_STORE, CHUNK_STORE], 'readwrite')
  const sourceStore = tx.objectStore(SOURCE_STORE)
  const chunkStore = tx.objectStore(CHUNK_STORE)
  for (const key of existingKeys) chunkStore.delete(key)
  const record = { ...source, chunkCount: chunks.length, updatedAt: Date.now() }
  sourceStore.put(record)
  chunks.forEach(chunk => chunkStore.put({ ...chunk, id: `${source.id}:${chunk.index}`, sourceId: source.id }))
  await transactionDone(tx)
  db.close()
  return record
}

export async function deleteSource(id) {
  const db = await openSourceDb()
  const keys = await chunkKeysForSource(db, id)
  const tx = db.transaction([SOURCE_STORE, CHUNK_STORE], 'readwrite')
  tx.objectStore(SOURCE_STORE).delete(id)
  const chunkStore = tx.objectStore(CHUNK_STORE)
  keys.forEach(key => chunkStore.delete(key))
  await transactionDone(tx)
  db.close()
}

export async function listChunks(sourceIds = null) {
  const db = await openSourceDb()
  const tx = db.transaction(CHUNK_STORE, 'readonly')
  const rows = await requestResult(tx.objectStore(CHUNK_STORE).getAll())
  db.close()
  if (!Array.isArray(sourceIds) || !sourceIds.length) return rows
  const allow = new Set(sourceIds)
  return rows.filter(row => allow.has(row.sourceId))
}

export async function updateChunkVectors(vectorsById) {
  const entries = Object.entries(vectorsById || {})
  if (!entries.length) return
  const db = await openSourceDb()
  const readTx = db.transaction(CHUNK_STORE, 'readonly')
  const rows = await requestResult(readTx.objectStore(CHUNK_STORE).getAll())
  const vectorMap = new Map(entries)
  const updates = rows.filter(row => vectorMap.has(row.id)).map(row => ({ ...row, vector: vectorMap.get(row.id), vectorUpdatedAt: Date.now() }))
  if (updates.length) {
    const tx = db.transaction(CHUNK_STORE, 'readwrite')
    const store = tx.objectStore(CHUNK_STORE)
    updates.forEach(row => store.put(row))
    await transactionDone(tx)
  }
  db.close()
}


export async function saveJob(job) {
  const db = await openSourceDb()
  const tx = db.transaction(JOB_STORE, 'readwrite')
  tx.objectStore(JOB_STORE).put({ ...job, updatedAt: Date.now() })
  await transactionDone(tx)
  db.close()
  return job
}

export async function getJob(id) {
  const db = await openSourceDb()
  const tx = db.transaction(JOB_STORE, 'readonly')
  const row = await requestResult(tx.objectStore(JOB_STORE).get(id))
  db.close()
  return row || null
}

export async function listJobs() {
  const db = await openSourceDb()
  const tx = db.transaction(JOB_STORE, 'readonly')
  const rows = await requestResult(tx.objectStore(JOB_STORE).getAll())
  db.close()
  return rows.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
}

export async function deleteJob(id) {
  const db = await openSourceDb()
  const tx = db.transaction(JOB_STORE, 'readwrite')
  tx.objectStore(JOB_STORE).delete(id)
  await transactionDone(tx)
  db.close()
}

export async function replaceSourcesWithChunks(sources = [], chunks = []) {
  const db = await openSourceDb()
  const tx = db.transaction([SOURCE_STORE, CHUNK_STORE], 'readwrite')
  const sourceStore = tx.objectStore(SOURCE_STORE)
  const chunkStore = tx.objectStore(CHUNK_STORE)
  sourceStore.clear()
  chunkStore.clear()
  for (const source of sources) sourceStore.put({ ...source, updatedAt: source.updatedAt || Date.now() })
  for (const chunk of chunks) chunkStore.put({ ...chunk, id: chunk.id || `${chunk.sourceId}:${chunk.index}` })
  await transactionDone(tx)
  db.close()
}

export async function clearSourceDb() {
  const db = await openSourceDb()
  const tx = db.transaction([SOURCE_STORE, CHUNK_STORE, JOB_STORE, OFFLINE_STORE], 'readwrite')
  tx.objectStore(SOURCE_STORE).clear()
  tx.objectStore(CHUNK_STORE).clear()
  tx.objectStore(JOB_STORE).clear()
  tx.objectStore(OFFLINE_STORE).clear()
  await transactionDone(tx)
  db.close()
}

export async function updateSourceMetadata(id, updater) {
  const db = await openSourceDb()
  const readTx = db.transaction(SOURCE_STORE, 'readonly')
  const current = await requestResult(readTx.objectStore(SOURCE_STORE).get(id))
  if (!current) { db.close(); return null }
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) }
  const record = { ...next, id, updatedAt: Date.now() }
  const tx = db.transaction(SOURCE_STORE, 'readwrite')
  tx.objectStore(SOURCE_STORE).put(record)
  await transactionDone(tx)
  db.close()
  return record
}


export async function putOfflineAsset({sourceId,index,blob,contentType='',bytes=0}) {
  const db = await openSourceDb()
  const tx = db.transaction(OFFLINE_STORE, 'readwrite')
  const id = `${sourceId}:${Number(index)||0}`
  const record = { id, sourceId, index:Number(index)||0, blob, contentType, bytes:Number(bytes||blob?.size||0), updatedAt:Date.now() }
  tx.objectStore(OFFLINE_STORE).put(record)
  await transactionDone(tx)
  db.close()
  return record
}

export async function getOfflineAsset(sourceId,index) {
  const db = await openSourceDb()
  const tx = db.transaction(OFFLINE_STORE, 'readonly')
  const row = await requestResult(tx.objectStore(OFFLINE_STORE).get(`${sourceId}:${Number(index)||0}`))
  db.close()
  return row || null
}

export async function listOfflineAssets(sourceId=null) {
  const db = await openSourceDb()
  const tx = db.transaction(OFFLINE_STORE, 'readonly')
  const store = tx.objectStore(OFFLINE_STORE)
  const rows = sourceId ? await requestResult(store.index('sourceId').getAll(sourceId)) : await requestResult(store.getAll())
  db.close()
  return rows.sort((a,b)=>(a.index||0)-(b.index||0))
}

export async function deleteOfflineAssetsForSource(sourceId) {
  const db = await openSourceDb()
  const readTx = db.transaction(OFFLINE_STORE, 'readonly')
  const keys = await requestResult(readTx.objectStore(OFFLINE_STORE).index('sourceId').getAllKeys(sourceId))
  if(keys.length){
    const tx = db.transaction(OFFLINE_STORE, 'readwrite')
    const store = tx.objectStore(OFFLINE_STORE)
    keys.forEach(key=>store.delete(key))
    await transactionDone(tx)
  }
  db.close()
}
