import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

const DATA_DIR = join(process.cwd(), 'data')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
const LOG_PATH = join(DATA_DIR, 'activity-log.json')

export async function logActivity(entry) {
  let entries = []
  try {
    const raw = await readFile(LOG_PATH, 'utf8')
    entries = JSON.parse(raw)
  } catch {}
  entries.unshift({ ...entry, id: Date.now(), ts: new Date().toISOString() })
  if (entries.length > 100) entries = entries.slice(0, 100)
  await writeFile(LOG_PATH, JSON.stringify(entries, null, 2), 'utf8')
}

export async function getActivity() {
  try {
    const raw = await readFile(LOG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}
