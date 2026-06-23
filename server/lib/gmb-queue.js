/**
 * GMB Auto-Poster — Queue logic
 *
 * Manages the on-disk image queue Josh drops gender-reveal product photos into.
 * The daily cron picks the oldest pending image, posts it to Google Business
 * Profile, then this module renames it into ./posted/ so it isn't picked again.
 *
 * Queue folder location is read from data/gmb-config.json (queueFolder field),
 * which lets Josh point the queue at any drive/Dropbox/iCloud folder without
 * code changes.
 *
 * Filtering rules (a file is SKIPPED when):
 *   - it lives inside the /posted/ subfolder
 *   - it ends with ".skip" (manual "do not post" flag)
 *   - it's a hidden dotfile (e.g. .DS_Store, ._thumb)
 *   - its extension isn't one of png/jpg/jpeg/webp
 *
 * Remaining files are sorted by mtime ASC so the oldest drop is posted first
 * (FIFO — feels intuitive when Josh drops a batch in).
 */

import { readdirSync, statSync, renameSync, existsSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import { readFileSync } from 'fs'
import { dataFile } from './data-dir.js'

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']
const POSTED_SUBFOLDER = 'posted'

/**
 * Load the queue folder path from gmb-config.json, then ensure the queue and
 * its /posted/ subfolder exist on disk. We auto-mkdir /posted/ so a fresh
 * install just works after the user creates the top-level queue folder.
 *
 * @returns {{ queue: string, posted: string }}
 */
function resolveFolders() {
  const configPath = dataFile('gmb-config.json')
  let config
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (e) {
    throw new Error(`[gmb-queue] Cannot read gmb-config.json at ${configPath}: ${e.message}`)
  }
  const queue = config.queueFolder
  if (!queue) {
    throw new Error('[gmb-queue] gmb-config.json is missing "queueFolder" field')
  }
  const posted = join(queue, POSTED_SUBFOLDER)
  // Auto-create /posted/ if missing — top-level queue must be user-created
  // (we don't silently create it; that'd hide misconfiguration).
  if (existsSync(queue)) {
    try {
      if (!existsSync(posted)) mkdirSync(posted, { recursive: true })
    } catch (e) {
      console.error(`[gmb-queue] Cannot create posted folder ${posted}:`, e.message)
    }
  }
  return { queue, posted }
}

/**
 * Decide whether a filename in the queue folder is a postable image.
 * Centralised so getNextImage() and getQueueStats() apply identical rules.
 */
function isPostableImage(filename) {
  if (!filename) return false
  if (filename.startsWith('.')) return false           // hidden dotfile
  if (filename.endsWith('.skip')) return false         // manual skip flag
  const lower = filename.toLowerCase()
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/**
 * Read all postable images from the queue (excluding the /posted/ subfolder)
 * and return them sorted by mtime ASC. Internal helper shared by
 * getNextImage() and getQueueStats() so the two views never disagree.
 *
 * Returns: [{ name, path, mtime }, ...]
 */
function listPending(queue) {
  if (!existsSync(queue)) return []
  let entries
  try {
    entries = readdirSync(queue, { withFileTypes: true })
  } catch (e) {
    console.error(`[gmb-queue] Cannot read queue folder ${queue}:`, e.message)
    return []
  }
  return entries
    .filter(d => d.isFile())                           // skip /posted/ and other dirs
    .map(d => d.name)
    .filter(isPostableImage)
    .map(name => {
      const path = join(queue, name)
      let mtime = 0
      try { mtime = statSync(path).mtimeMs } catch (_) { /* unreadable — drop later */ }
      return { name, path, mtime }
    })
    .filter(f => f.mtime > 0)                          // drop stat-failed entries
    .sort((a, b) => a.mtime - b.mtime)                 // oldest first (FIFO)
}

/**
 * Count files already posted (informational only — used in stats UI).
 */
function countPosted(posted) {
  if (!existsSync(posted)) return 0
  try {
    return readdirSync(posted)
      .filter(isPostableImage)
      .length
  } catch (e) {
    console.error(`[gmb-queue] Cannot read posted folder ${posted}:`, e.message)
    return 0
  }
}

/**
 * Return the next image the daily cron should post, or null if queue is empty.
 * Caller is responsible for calling markPosted(image.path) after a successful
 * upload.
 *
 * @returns {{ name: string, path: string, mtime: number } | null}
 */
export function getNextImage() {
  const { queue } = resolveFolders()
  const pending = listPending(queue)
  return pending[0] || null
}

/**
 * Move a successfully-posted image into the /posted/ subfolder so it won't be
 * picked up again on tomorrow's run. We rename rather than delete so Josh can
 * always see what's been published and re-post manually if needed.
 *
 * @param {string} imagePath - absolute path to the image inside the queue folder
 */
export function markPosted(imagePath) {
  if (!imagePath) throw new Error('[gmb-queue] markPosted requires an imagePath')
  const { posted } = resolveFolders()
  const filename = basename(imagePath)
  const dest = join(posted, filename)
  renameSync(imagePath, dest)
  return dest
}

/**
 * Map a filename to its category/URL mapping by substring match. Filename is
 * lower-cased before matching so "TNT-Sydney.png" hits both "tnt" and "sydney"
 * — the FIRST non-default match wins, so order in urlMapping is significant.
 *
 * Falls back to the "default" mapping (filenameMatch === 'default') when
 * nothing else hits.
 *
 * @param {string} filename
 * @param {Array<{filenameMatch: string, url: string, button: string}>} urlMapping
 */
export function getCategoryFromFilename(filename, urlMapping) {
  if (!filename || !Array.isArray(urlMapping)) return null
  const lower = filename.toLowerCase()
  for (const m of urlMapping) {
    if (m.filenameMatch !== 'default' && lower.includes(m.filenameMatch)) return m
  }
  return urlMapping.find(m => m.filenameMatch === 'default') || null
}

/**
 * Summary stats for the admin UI: how many images are waiting, how many have
 * already been posted, and what's up next.
 *
 * @returns {{ pending: number, posted: number, nextImage: object|null }}
 */
export function getQueueStats() {
  const { queue, posted } = resolveFolders()
  const pendingList = listPending(queue)
  return {
    pending: pendingList.length,
    posted: countPosted(posted),
    nextImage: pendingList[0] || null,
  }
}
