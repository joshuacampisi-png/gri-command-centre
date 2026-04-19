/**
 * blog-topic-queue.js
 * ─────────────────────────────────────────────────────────────
 * Manual blog topic queue. Josh can drop briefs in here and the
 * autopublish pipeline picks them up before the rotating keyword
 * pool. FIFO order by default.
 *
 * Persisted to disk so additions survive restarts.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { dataFile } from './data-dir.js'

const QUEUE_FILE = dataFile('blog-autopublish/topic-queue.json')
const DONE_FILE = dataFile('blog-autopublish/topic-queue-done.json')

function loadQueue() {
  try {
    if (!existsSync(QUEUE_FILE)) return []
    return JSON.parse(readFileSync(QUEUE_FILE, 'utf-8'))
  } catch { return [] }
}

function saveQueue(items) {
  try {
    mkdirSync(dirname(QUEUE_FILE), { recursive: true })
    writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2))
  } catch (e) { console.warn('[TopicQueue] Save failed:', e.message) }
}

function loadDone() {
  try {
    if (!existsSync(DONE_FILE)) return []
    return JSON.parse(readFileSync(DONE_FILE, 'utf-8'))
  } catch { return [] }
}

function saveDone(items) {
  try {
    mkdirSync(dirname(DONE_FILE), { recursive: true })
    writeFileSync(DONE_FILE, JSON.stringify(items.slice(0, 200), null, 2))
  } catch (e) { console.warn('[TopicQueue] Done save failed:', e.message) }
}

/**
 * @returns {{keyword, articleType, brief?, addedAt} | null}
 */
export function peekNext() {
  const queue = loadQueue()
  return queue[0] || null
}

/**
 * Pop next topic from the queue and move it to the done list.
 */
export function popNext() {
  const queue = loadQueue()
  if (queue.length === 0) return null
  const next = queue.shift()
  saveQueue(queue)
  const done = loadDone()
  done.unshift({ ...next, pickedAt: new Date().toISOString() })
  saveDone(done)
  return next
}

/**
 * Mark a keyword as published by writing to done (used when
 * using the fallback keyword pool so we don't add to done twice).
 */
export function recordPublished(keyword, articleType, extras = {}) {
  const done = loadDone()
  done.unshift({ keyword, articleType, pickedAt: new Date().toISOString(), ...extras })
  saveDone(done)
}

export function addTopic({ keyword, articleType = 'informational', brief = '' }) {
  if (!keyword) throw new Error('keyword required')
  const queue = loadQueue()
  queue.push({
    keyword: keyword.trim(),
    articleType,
    brief: brief.trim(),
    addedAt: new Date().toISOString(),
  })
  saveQueue(queue)
  return { queued: queue.length }
}

export function listQueue() { return loadQueue() }
export function listDone(limit = 30) { return loadDone().slice(0, limit) }

export function removeTopic(keyword) {
  const queue = loadQueue().filter(t => t.keyword !== keyword)
  saveQueue(queue)
  return queue.length
}
