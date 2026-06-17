import { writeFile, readFile, rename } from 'node:fs/promises'
import { dataFile } from './data-dir.js'

const LOG_PATH = dataFile('activity-log.json')
const MAX_ENTRIES = 500

let writeChain = Promise.resolve()

export async function logActivity(entry) {
  const run = async () => {
    let entries = []
    try {
      const raw = await readFile(LOG_PATH, 'utf8')
      entries = JSON.parse(raw)
    } catch {}
    entries.unshift({ ...entry, id: Date.now(), ts: new Date().toISOString() })
    if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES)
    const tmpPath = `${LOG_PATH}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmpPath, JSON.stringify(entries, null, 2), 'utf8')
    await rename(tmpPath, LOG_PATH)
  }
  const next = writeChain.then(run, run)
  writeChain = next.catch(() => {})
  return next
}

export async function getActivity() {
  try {
    const raw = await readFile(LOG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}
