// Durable state for the gateway: accounts, device sessions and workspace
// snapshots.
//
// Files, not a database, because this is a personal single-node gateway and a
// database would be a dependency to install, back up and migrate for data that
// fits in a directory the user can copy.
//
// Two properties are not optional:
//
//   1. Writes are atomic. A snapshot can be tens of megabytes; a process that
//      dies mid-write must not leave a half-written file that fails to parse
//      on the next start, taking the account's whole workspace with it. Every
//      write goes to a temp file and is renamed into place, which is atomic on
//      POSIX within a filesystem.
//   2. Read-modify-write is serialised per file. Two devices pushing at once
//      would otherwise interleave and one would silently overwrite the other.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'

const locks = new Map()

/** Runs `fn` with exclusive access to `key`, in arrival order. */
export function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve()
  // Chained off the settled outcome so one failure does not wedge the queue.
  const next = previous.then(fn, fn)
  locks.set(key, next.then(() => {}, () => {}))
  return next
}

async function writeAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, text, 'utf8')
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {})
    throw error
  }
}

export async function readJsonFile(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    // A corrupt file is reported, not silently replaced: losing an account
    // file without saying so is worse than refusing to start the feature.
    throw new Error(`Не удалось прочитать ${path}: ${error.message}`)
  }
}

export function createStore(dataDir) {
  const root = resolve(dataDir)
  const accountsPath = join(root, 'accounts.json')

  /**
   * Snapshot path for one workspace. The two ids are attacker-influenced, so
   * they are validated by the caller and the result is re-checked to still be
   * inside the data directory.
   */
  function workspacePath(ownerId, workspaceId) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(ownerId))) throw new Error('Некорректный идентификатор владельца')
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(workspaceId))) throw new Error('Некорректный идентификатор рабочего пространства')
    const path = resolve(join(root, 'workspaces', `${ownerId}__${workspaceId}.json`))
    if (!path.startsWith(resolve(join(root, 'workspaces')) + sep)) throw new Error('Некорректный путь рабочего пространства')
    return path
  }

  const emptyDb = () => ({ format: 'noteai-accounts-v1', accounts: {}, sessions: {} })

  return {
    root,

    async readAccounts() {
      return (await readJsonFile(accountsPath, null)) || emptyDb()
    },

    /** Read, mutate, write — with no other writer interleaving. */
    updateAccounts(mutate) {
      return withLock(accountsPath, async () => {
        const db = (await readJsonFile(accountsPath, null)) || emptyDb()
        const result = await mutate(db)
        await writeAtomic(accountsPath, JSON.stringify(db, null, 2))
        return result
      })
    },

    async readWorkspace(ownerId, workspaceId) {
      return readJsonFile(workspacePath(ownerId, workspaceId), null)
    },

    updateWorkspace(ownerId, workspaceId, mutate) {
      const path = workspacePath(ownerId, workspaceId)
      return withLock(path, async () => {
        const current = await readJsonFile(path, null)
        const { next, result } = await mutate(current)
        if (next) await writeAtomic(path, JSON.stringify(next))
        return result
      })
    }
  }
}
