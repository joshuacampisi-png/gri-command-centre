/**
 * pickup-locations.js
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for TNT Kit pickup/return locations.
 * Shopify orders carry a "Pick Up Location" line-item property
 * (set on the product page) — its value is one of the keys below.
 *
 * Every customer-facing surface (confirmation email, contract PDF,
 * signing page HTML) MUST go through resolvePickupLocation() so a
 * Sydney customer never sees the Gold Coast address again.
 * ─────────────────────────────────────────────────────────────
 */

export const PICKUP_LOCATIONS = {
  // Key is the lower-cased Shopify property value with whitespace
  // collapsed. Use normalisePickupKey() before lookups.
  'gold coast hq': {
    key: 'gold coast hq',
    label: 'Gold Coast HQ',
    address: '3B/13 Upton Street, Bundall QLD 4217',
    shortAddress: '3B/13 Upton St, Bundall',
    pickupHours: 'between 7 a.m. and 2 p.m.',
    returnHours: 'before 2:00 pm',
  },
  'sydney': {
    key: 'sydney',
    label: 'Sydney',
    address: '5 Potter Street, Waterloo NSW 2017',
    shortAddress: '5 Potter St, Waterloo NSW',
    pickupHours: 'between 7 a.m. and 2 p.m.',
    returnHours: 'before 2:00 pm',
  },
}

// Safe default used when a hire predates the pickup-location capture or
// when Shopify ships an unrecognised value. Defaults to Gold Coast HQ —
// that was the only address the system used before this module landed,
// so behaviour for legacy hires is unchanged.
export const DEFAULT_PICKUP_LOCATION_KEY = 'gold coast hq'

function normalisePickupKey(raw) {
  if (!raw) return null
  return String(raw).toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Resolve a pickup location config from whatever the hire record carries.
 * Always returns a usable object — falls back to DEFAULT_PICKUP_LOCATION_KEY
 * for null/unknown values so consumer code can call .address directly.
 *
 * @param {string|null|undefined} raw  e.g. 'Gold Coast HQ', 'Sydney', ''
 * @returns {{ key, label, address, shortAddress, pickupHours, returnHours }}
 */
export function resolvePickupLocation(raw) {
  const key = normalisePickupKey(raw)
  if (key && PICKUP_LOCATIONS[key]) return PICKUP_LOCATIONS[key]
  return PICKUP_LOCATIONS[DEFAULT_PICKUP_LOCATION_KEY]
}

/**
 * Parse the "Pick Up Location" Shopify line-item property out of a
 * Shopify line item. Returns the canonical key string ('gold coast hq'
 * or 'sydney') so it can be stored on the hire record.
 *
 * @param {object} lineItem  Shopify line item
 * @returns {string|null}
 */
export function extractPickupKeyFromLineItem(lineItem) {
  const props = lineItem?.properties || []
  for (const p of props) {
    const name = (p.name || '').toLowerCase().replace(/[_\s-]/g, '')
    if (name === 'pickuplocation' || name === 'location') {
      return normalisePickupKey(p.value)
    }
  }
  return null
}
