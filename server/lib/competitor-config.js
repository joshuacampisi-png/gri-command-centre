/**
 * Centralised Competitor Configuration
 * Single source of truth for all competitor data across the app.
 * Add/remove competitors here — everything else imports from this file.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const CONFIG_FILE = dataFile('competitor-config.json')

// Default competitor list
const DEFAULT_COMPETITORS = {
  gri: {
    name: 'Gender Reveal Ideas',
    domain: 'genderrevealideas.com.au',
    color: '#ef4444',
    isOwn: true,
  },
  celebration: {
    name: 'CelebrationHQ',
    domain: 'celebrationhq.com.au',
    color: '#6366f1',
    isOwn: false,
  },
  aussie: {
    name: 'Aussie Reveals',
    domain: 'aussiereveals.com.au',
    color: '#f97316',
    isOwn: false,
  },
  express: {
    name: 'Gender Reveal Express',
    domain: 'genderrevealexpress.com.au',
    color: '#eab308',
    isOwn: false,
  },
  revealer: {
    name: 'Gender Revealer',
    domain: 'genderrevealer.com.au',
    color: '#8b5cf6',
    isOwn: false,
  },
  revauz: {
    name: 'Gender Reveals Australia',
    domain: 'genderrevealsaustralia.com.au',
    color: '#14b8a6',
    isOwn: false,
  },
}

/**
 * Load competitors from disk (falls back to defaults)
 */
export function getCompetitors() {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    }
  } catch {}
  // First run: write defaults to disk
  saveCompetitors(DEFAULT_COMPETITORS)
  return DEFAULT_COMPETITORS
}

/**
 * Save competitors to disk
 */
export function saveCompetitors(competitors) {
  writeFileSync(CONFIG_FILE, JSON.stringify(competitors, null, 2))
}

/**
 * Add a new competitor
 */
export function addCompetitor(id, { name, domain, color }) {
  const competitors = getCompetitors()
  competitors[id] = { name, domain, color, isOwn: false }
  saveCompetitors(competitors)
  return competitors
}

/**
 * Remove a competitor (cannot remove GRI)
 */
export function removeCompetitor(id) {
  if (id === 'gri') throw new Error('Cannot remove your own store')
  const competitors = getCompetitors()
  delete competitors[id]
  saveCompetitors(competitors)
  return competitors
}

/**
 * Get only rival competitors (excludes GRI)
 */
export function getRivals() {
  const all = getCompetitors()
  return Object.fromEntries(
    Object.entries(all).filter(([, v]) => !v.isOwn)
  )
}

/**
 * Get competitor list as array (for DataForSEO calls)
 */
export function getCompetitorArray() {
  const all = getCompetitors()
  return Object.entries(all).map(([id, comp]) => ({
    id,
    ...comp,
  }))
}
