import { normalizeCompany } from './companies.js'

const COMPANY_CONTEXT = {
  Lionzen: 'Lionzen is a wellness e-commerce brand where clear education, conversion-focused product presentation, and a clean buying journey are critical to performance.',
  GRI: 'GRI is a party retail brand where merchandising clarity, campaign execution, and clean category or landing page presentation directly affect customer action.',
  GBU: 'GBU is a specialist retail brand where clear product communication, execution accuracy, and trust-building storefront presentation are critical to conversion.'
}

function sentenceCase(text = '') {
  const clean = String(text).trim()
  if (!clean) return ''
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function stripCompanyPrefix(prompt = '', company = '') {
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(prompt).replace(new RegExp(`^${escaped}\\s+`, 'i'), '').trim()
}

export function detectTaskType(prompt = '') {
  const p = prompt.toLowerCase()
  if (p.includes('landing page') || p.includes('custom page') || p.includes('page build')) return 'landing-page-build'
  if (p.includes('seo')) return 'seo-build'
  if (p.includes('banner')) return 'banner-update'
  if (p.includes('graphic') || p.includes('creative')) return 'creative-update'
  if (p.includes('bug') || p.includes('broken') || p.includes('fix')) return 'bug-fix'
  if (p.includes('product page') || p.includes('pdp')) return 'product-page-update'
  return 'general-execution'
}

function detectBriefMode(taskType) {
  if (['landing-page-build', 'seo-build', 'bug-fix', 'general-execution'].includes(taskType)) return 'lean-dev'
  if (['banner-update', 'creative-update'].includes(taskType)) return 'creative'
  return 'lean-dev'
}

function simplifyTitlePrompt(prompt = '') {
  return String(prompt)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(from this spec|from this specification|from this doc|from this document|using this spec|using this document|using this doc|based on this spec|based on this document|based on this doc|according to the spec|according to this spec|according to the document|according to this document)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function emojiForTaskType(taskType = 'general-execution') {
  if (taskType === 'landing-page-build') return '🧱'
  if (taskType === 'seo-build') return '📈'
  if (taskType === 'banner-update') return '🎯'
  if (taskType === 'creative-update') return '🎨'
  if (taskType === 'bug-fix') return '🛠️'
  if (taskType === 'product-page-update') return '🛍️'
  return '⚡'
}

export function makeTaskTitle(prompt = '', taskType = 'general-execution') {
  const simplified = sentenceCase(simplifyTitlePrompt(prompt))
  let baseTitle = ''
  if (taskType === 'landing-page-build' || taskType === 'seo-build') {
    if (/balloon landing page/i.test(simplified) && /seo/i.test(simplified)) baseTitle = 'Build SEO-Focused Balloon Landing Page'
    else if (/landing page/i.test(simplified) && /seo/i.test(simplified)) baseTitle = simplified
    else if (/landing page/i.test(simplified)) baseTitle = simplified
    else baseTitle = `Build SEO-Focused Page${simplified ? `: ${simplified}` : ''}`
  } else if (taskType === 'banner-update') {
    baseTitle = simplified.replace(/^Execute\s+/i, '') || 'Execute Banner Update'
  } else if (taskType === 'creative-update') {
    baseTitle = simplified.replace(/^Execute\s+/i, '') || 'Execute Creative Update'
  } else if (taskType === 'bug-fix') {
    baseTitle = simplified.replace(/^Fix\s*/i, 'Fix ') || 'Fix Reported Issue'
  } else {
    baseTitle = simplified || 'Execute Requested Task'
  }
  return `${emojiForTaskType(taskType)} ${baseTitle}`
}

function buildProblemStatement(company, prompt, taskType, hasReference) {
  const clean = sentenceCase(prompt)
  const sourceContext = hasReference
    ? 'A source document or reference has been supplied, but the requested work has not yet been correctly executed.'
    : 'The requested work has not yet been correctly executed.'

  if (taskType === 'landing-page-build' || taskType === 'seo-build') {
    return `The current page or experience is not sufficiently aligned with the intended SEO structure, content hierarchy, or marketing execution. ${sourceContext} The new page needs to be built according to the supplied specification so the live experience supports SEO performance, content clarity, and the intended campaign structure.`
  }

  if (taskType === 'bug-fix') {
    return `There is an execution issue affecting the live experience: ${clean}. Until this is fixed, the page or flow remains inconsistent, broken, or unclear for users.`
  }

  return `${sourceContext} The requested task is: ${clean}. ${COMPANY_CONTEXT[company]}`
}

function buildObjective(company, prompt, taskType, hasReference) {
  const clean = sentenceCase(prompt)
  if (taskType === 'landing-page-build' || taskType === 'seo-build') {
    return `Build the new page according to the supplied specification, with correct content hierarchy, clean structure, and SEO-focused implementation. The final page should accurately reflect the source material and be production-ready across devices.`
  }
  if (taskType === 'bug-fix') {
    return `Resolve the issue described in this task so the affected experience behaves correctly and consistently in production.`
  }
  return `Execute the requested update for ${company}: ${clean}. Complete the work accurately and ensure the final output is clear, usable, and production-ready.`
}

function buildRequirements(taskType, prompt = '', hasReference = false) {
  const sourceLine = hasReference
    ? 'Use the supplied document or references as the source of truth.'
    : 'Use the task request as the source of truth.'

  if (taskType === 'landing-page-build' || taskType === 'seo-build') {
    return [
      sourceLine,
      'Match the intended page structure, section order, and content hierarchy.',
      'Implement SEO-friendly headings, layout structure, and readable content formatting where applicable.',
      'Ensure the page renders cleanly across desktop and mobile devices.',
      'Avoid unnecessary layout inconsistencies, formatting drift, or front-end bloat.'
    ]
  }

  if (taskType === 'bug-fix') {
    return [
      sourceLine,
      `Fix the issue described: ${sentenceCase(prompt)}`,
      'Ensure the affected area behaves correctly across relevant devices and states.',
      'Do not introduce regressions or instability elsewhere in the experience.'
    ]
  }

  return [
    sourceLine,
    `Execute the requested work accurately: ${sentenceCase(prompt)}`,
    'Ensure the final implementation is clear, stable, and production-ready across relevant devices.'
  ]
}

function buildExpectedOutcome(company, prompt, taskType, hasReference) {
  if (taskType === 'landing-page-build' || taskType === 'seo-build') {
    return `A production-ready page that reflects the supplied source material, is clearly structured for SEO, and presents the required content accurately across devices.`
  }
  if (taskType === 'bug-fix') {
    return `The issue is resolved in production and the affected experience works consistently without introducing regressions.`
  }
  return `The requested task for ${company} is completed accurately and the final output is ready for review or deployment.${hasReference ? ' The implementation should align closely with the supplied source material.' : ''}`
}

function buildAcceptanceCriteria(taskType, prompt = '') {
  if (taskType === 'landing-page-build' || taskType === 'seo-build') {
    return [
      'Page matches the supplied source material closely',
      'Content hierarchy is correctly structured',
      'Desktop and mobile rendering are both clean',
      'No obvious formatting or layout inconsistencies remain'
    ]
  }
  if (taskType === 'bug-fix') {
    return [
      `Issue no longer reproducible: ${sentenceCase(prompt)}`,
      'Affected area works correctly on relevant devices and states',
      'No obvious regressions introduced'
    ]
  }
  return [
    'Requested work completed accurately',
    'Implementation is stable and review-ready'
  ]
}

function buildCreativeDeliverables(prompt = '') {
  return [
    `Execute the requested creative work: ${sentenceCase(prompt)}`,
    'Ensure the final asset or update matches the supplied references and intended campaign direction.',
    'Keep the final output clean, on-brand, and ready for implementation or publishing.'
  ]
}

export function buildStructuredTask({ company, prompt, creativeLink, referenceLinks = [], mediaReferences = [] }) {
  const c = normalizeCompany(company)
  const cleanPrompt = stripCompanyPrefix((prompt || '').trim(), c)
  const taskType = detectTaskType(cleanPrompt)
  const briefMode = detectBriefMode(taskType)
  const title = makeTaskTitle(cleanPrompt, taskType)
  const references = [...new Set(referenceLinks.filter(Boolean))]
  const media = [...new Set(mediaReferences.filter(Boolean))]
  const hasReference = Boolean(references.length || creativeLink || media.length)
  const creativeHeader = creativeLink ? `**Creative link:**\n${creativeLink}\n\n` : ''
  const referenceHeader = references.length ? `**Reference link(s):**\n\n${references.join('\n\n')}\n\n` : ''
  const header = `${creativeHeader}${referenceHeader}`

  if (briefMode === 'creative') {
    return `${header}## 🧩 Task Title\n\n${title}\n\n---\n\n## 🎯 Objective\n\nExecute the requested creative update accurately and align it with the supplied references, campaign context, and intended visual direction.\n\n---\n\n## ✅ Deliverables\n\n${buildCreativeDeliverables(cleanPrompt).map(item => `* ${item}`).join('\n')}\n\n---\n\n## 🚀 Expected Outcome\n\nA clean, on-brand creative output that is ready for implementation, review, or publishing.`
  }

  return `${header}## 🧩 Task Title\n\n${title}\n\n---\n\n## 🧠 Problem Statement\n\n${buildProblemStatement(c, cleanPrompt, taskType, hasReference)}\n\n---\n\n## 🎯 Objective\n\n${buildObjective(c, cleanPrompt, taskType, hasReference)}\n\n---\n\n## ✅ Requirements\n\n${buildRequirements(taskType, cleanPrompt, hasReference).map(item => `* ${item}`).join('\n')}\n\n---\n\n## 📌 Acceptance Criteria\n\n${buildAcceptanceCriteria(taskType, cleanPrompt).map(item => `* ${item}`).join('\n')}\n\n---\n\n## 🚀 Expected Outcome\n\n${buildExpectedOutcome(c, cleanPrompt, taskType, hasReference)}\n`
}
