import { COMPANIES } from './companies.js'

export function detectCompanyFromText(text = '') {
  const upper = String(text).toUpperCase()
  for (const company of COMPANIES) {
    if (upper.includes(company.toUpperCase())) return company
  }
  return null
}

export function extractUrls(text = '') {
  return String(text).match(/https?:\/\/\S+/gi) || []
}

export function extractFirstUrl(text = '') {
  const urls = extractUrls(text)
  return urls[0] || ''
}

export function classifyIntake(text = '') {
  const t = String(text).toLowerCase()
  if (['bug', 'broken', 'error', 'issue'].some(k => t.includes(k))) return 'Bug'
  if (['banner', 'creative', 'graphic', 'graphics', 'hero'].some(k => t.includes(k))) return 'Creative / Product Page'
  if (['title', 'titles', 'product page', 'pdp', 'section', 'sections', 'theme'].some(k => t.includes(k))) return 'Product Page'
  return 'Task'
}

export function buildStaffConfirmation({ company, notionUrl = '' }) {
  return [
    `Task lodged for ${company}`,
    notionUrl || null
  ].filter(Boolean).join('\n')
}

export function buildMissingCompanyReply() {
  return [
    'I can log this, but I need the company first.',
    '',
    'Please resend with one of:',
    'GRI',
    'GBU',
    'Lionzen',
    '',
    'Example: /task GRI update the homepage banner and mobile CTA'
  ].join('\n')
}
