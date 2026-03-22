export function normalizeRichText(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(part => part?.plain_text || '').join('').trim()
  }
  return ''
}

export function firstDefined(...values) {
  return values.find(v => v !== undefined && v !== null && v !== '')
}

export function findProperty(properties, predicate) {
  for (const [name, prop] of Object.entries(properties || {})) {
    if (predicate(name, prop)) return [name, prop]
  }
  return [null, null]
}

export function findTitleProperty(properties) {
  return findProperty(properties, (_name, prop) => prop?.type === 'title')
}

export function findRichTextProperty(properties, names = []) {
  const lowered = names.map(n => n.toLowerCase())
  return findProperty(properties, (name, prop) => prop?.type === 'rich_text' && lowered.includes(name.toLowerCase()))
}

export function findSelectProperty(properties, names = []) {
  const lowered = names.map(n => n.toLowerCase())
  return findProperty(properties, (name, prop) => prop?.type === 'select' && lowered.includes(name.toLowerCase()))
}

export function findDateProperty(properties, names = []) {
  const lowered = names.map(n => n.toLowerCase())
  return findProperty(properties, (name, prop) => prop?.type === 'date' && lowered.includes(name.toLowerCase()))
}

export function pageTitle(page, titleKey) {
  return normalizeRichText(page?.properties?.[titleKey]?.title)
}

export function pageSelect(page, key) {
  return page?.properties?.[key]?.select?.name || ''
}

export function pageDate(page, key) {
  return page?.properties?.[key]?.date?.start || ''
}

export function pageRichText(page, key) {
  return normalizeRichText(page?.properties?.[key]?.rich_text)
}
