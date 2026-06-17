/**
 * Central data directory resolver.
 * On Railway with a persistent volume, uses RAILWAY_VOLUME_MOUNT_PATH.
 * Locally, uses process.cwd()/data as before.
 */
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || join(process.cwd(), 'data')

// Ensure the root data dir exists
try { if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true }) }
catch (e) { console.error('[DataDir] Cannot create root:', e.message) }

// LOUD warning if we're on Railway without the volume mount env — without
// this, every staff-entered byte goes to the Docker image's shadowed /app/data
// and dies on next redeploy. Silent data loss is the worst kind.
if (process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  console.error('═══════════════════════════════════════════════════════════════')
  console.error('⚠️  CRITICAL: RAILWAY_VOLUME_MOUNT_PATH is NOT SET')
  console.error('   All staff-entered data (hires, shipping costs, contracts)')
  console.error('   will be LOST on the next redeploy.')
  console.error('   Fix: attach a persistent volume to this Railway service.')
  console.error('═══════════════════════════════════════════════════════════════')
}
console.log(`[DataDir] Root: ${ROOT}  (${process.env.RAILWAY_VOLUME_MOUNT_PATH ? 'volume-backed ✓' : 'local fs'})`)

/**
 * Get the resolved data directory path.
 * @param {...string} subpath - optional subdirectory segments
 * @returns {string} absolute path
 */
export function dataDir(...subpath) {
  const dir = join(ROOT, ...subpath)
  try { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }) }
  catch (e) { console.error(`[DataDir] Cannot create ${dir}:`, e.message) }
  return dir
}

/**
 * Get the full path to a data file.
 * Ensures the parent directory exists.
 * @param {string} filename - e.g. 'daily-sales.json' or 'competitor-history/rankings.json'
 * @returns {string} absolute file path
 */
export function dataFile(filename) {
  const full = join(ROOT, filename)
  const dir = join(full, '..')
  try { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }) }
  catch (e) { console.error(`[DataDir] Cannot create ${dir}:`, e.message) }
  return full
}

export const DATA_ROOT = ROOT
