/**
 * Central data directory resolver.
 * On Railway with a persistent volume, uses RAILWAY_VOLUME_MOUNT_PATH.
 * Locally, uses process.cwd()/data as before.
 */
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || join(process.cwd(), 'data')

// Ensure the root data dir exists
if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true })

/**
 * Get the resolved data directory path.
 * @param {...string} subpath - optional subdirectory segments
 * @returns {string} absolute path
 */
export function dataDir(...subpath) {
  const dir = join(ROOT, ...subpath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
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
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return full
}

export const DATA_ROOT = ROOT
