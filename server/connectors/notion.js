import { Client } from '@notionhq/client'
import { env } from '../lib/env.js'
import { findProperty, normalizeRichText } from '../lib/notion-helpers.js'
import { normalizeCompany } from '../lib/companies.js'

const hasToken = Boolean(env.notion.token)
const notion = hasToken ? new Client({ auth: env.notion.token }) : null

const dbMap = {
  tasks: env.notion.tasksDb,
  findings: env.notion.findingsDb,
  reports: env.notion.reportsDb,
  sops: env.notion.sopsDb,
  approvals: env.notion.approvalsDb,
}

async function getDatabase(database_id) { return notion.databases.retrieve({ database_id }) }
async function queryDatabase(database_id, filter = undefined) {
  // Paginate through ALL results — Notion caps each page at 100
  const allResults = []
  let cursor = undefined
  let page = 0
  while (true) {
    page++
    const body = { page_size: 100 }
    if (filter) body.filter = filter
    if (cursor) body.start_cursor = cursor
    const resp = await fetch(`https://api.notion.com/v1/databases/${database_id}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.notion.token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!resp.ok) throw new Error(`Notion query failed: ${resp.status} ${await resp.text()}`)
    const data = await resp.json()
    allResults.push(...(data.results || []))
    if (!data.has_more || !data.next_cursor) break
    cursor = data.next_cursor
    if (page > 20) break // safety cap: 2000 results max
  }
  return { results: allResults, has_more: false }
}
async function createPage(parentDb, properties) { return notion.pages.create({ parent: { database_id: parentDb }, properties }) }
async function appendChildren(block_id, children = []) { return notion.blocks.children.append({ block_id, children }) }
function titlePropPayload(name) { return { title: [{ text: { content: name } }] } }
function richTextPayload(text) { return { rich_text: [{ text: { content: text } }] } }
function chunkRichTextPayload(text = '', size = 1800) {
  const chunks = []
  for (let i = 0; i < text.length; i += size) chunks.push({ text: { content: text.slice(i, i + size) } })
  return { rich_text: chunks.length ? chunks : [{ text: { content: '' } }] }
}
function selectPayload(name) { return { select: { name } } }
function datePayload(start) { return { date: { start } } }
function checkboxPayload(value) { return { checkbox: Boolean(value) } }
function urlPayload(value = '') { return { url: value || null } }
function peoplePayload(ids = []) { return { people: ids.filter(Boolean).map(id => ({ id })) } }
function headingBlock(text) { return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: text } }] } } }
function imageBlock(url) { return { object: 'block', type: 'image', image: { type: 'external', external: { url } } } }
function byType(properties, type) { const [name] = findProperty(properties, (_n, prop) => prop?.type === type); return name }
async function ensureSeed(databaseId, builder) {
  const rows = await queryDatabase(databaseId)
  if (rows.results.length > 0) return rows
  const db = await getDatabase(databaseId)
  const properties = builder(db.properties || {})
  await createPage(databaseId, properties)
  return queryDatabase(databaseId)
}
async function safeLoad(databaseId, builder, mapper) {
  try {
    const rows = await ensureSeed(databaseId, builder)
    return { ok: true, rows: mapper(rows.results), error: null }
  } catch (error) {
    return { ok: false, rows: [], error: String(error?.message || error) }
  }
}
function prop(page, key) { return page?.properties?.[key] }
function pageTitleByName(page, key = 'Title') { return normalizeRichText(prop(page, key)?.title) }
function pageSelectByName(page, key) { return prop(page, key)?.select?.name || '' }
function pageDateByName(page, key) { return prop(page, key)?.date?.start || '' }
function pageRichTextByName(page, key) { return normalizeRichText(prop(page, key)?.rich_text) }
function pageUrlByName(page, key) { return prop(page, key)?.url || '' }

function taskSeed(properties) {
  const title = byType(properties, 'title') || 'Title'
  return {
    [title]: titlePropPayload('Improve PDP mobile CTA visibility'),
    'Company': selectPayload('Lionzen'),
    'Status': selectPayload('Backlog'),
    'Priority': selectPayload('High'),
    'Owner Agent': selectPayload('shopify-dev'),
    'Source Agent': selectPayload('analyst'),
    'Task Type': selectPayload('Product Page'),
    'Executor': selectPayload('Shopify Dev Agent'),
    'Execution Stage': selectPayload('Backlog'),
    'PR Status': selectPayload('Not Started'),
    'Notes': richTextPayload('Increase clarity and tap visibility for mobile product-page call to action.'),
  }
}
function findingsSeed(properties) {
  const title = byType(properties, 'title') || 'Title'
  return {
    [title]: titlePropPayload('Cart abandonment rising on mobile'),
    'Company': selectPayload('Lionzen'),
    'Problem': richTextPayload('Mobile users appear to be dropping before purchase completion.'),
    'Evidence': richTextPayload('Seed finding for command-centre setup.'),
    'Impact': richTextPayload('Potential conversion leakage.'),
    'Recommendation': richTextPayload('Review mobile cart and PDP CTA friction.'),
    'Suggested Owner': selectPayload('shopify-dev'),
    'Priority': selectPayload('High'),
    'Source Data': selectPayload('Shopify'),
    'Created By Agent': selectPayload('analyst'),
    'Status': selectPayload('New'),
  }
}
function reportsSeed(properties) {
  const title = byType(properties, 'title') || 'Title'
  return {
    [title]: titlePropPayload('Daily Ops Report'),
    'Company': selectPayload('Lionzen'),
    'Report Type': selectPayload('Daily Ops'),
    'Agent': selectPayload('ops-manager'),
    'Date': datePayload(new Date().toISOString()),
    'Summary': richTextPayload('Initial seeded report for the command centre.'),
  }
}
function sopsSeed(properties) {
  const title = byType(properties, 'title') || 'Title'
  return {
    [title]: titlePropPayload('AI command centre startup review'),
    'Company': selectPayload('Lionzen'),
    'Function': selectPayload('Command'),
    'Owner': richTextPayload('Pablo Escobot'),
    'Status': selectPayload('Draft'),
    'Last Updated': datePayload(new Date().toISOString()),
  }
}
function approvalsSeed(properties) {
  const title = byType(properties, 'title') || 'Title'
  return {
    [title]: titlePropPayload('Approve initial production theme deploy policy'),
    'Company': selectPayload('Lionzen'),
    'Status': selectPayload('Pending'),
    'Risk Level': selectPayload('Medium'),
    'Requested By': selectPayload('main'),
    'Summary': richTextPayload('Seed approval item for command-centre workflow.'),
    'Date': datePayload(new Date().toISOString()),
  }
}

function mapTasks(pages) { return pages.map(page => ({ id: page.id, company: pageSelectByName(page, 'Company'), title: pageTitleByName(page), owner: pageSelectByName(page, 'Owner Agent'), executor: pageSelectByName(page, 'Executor'), taskType: pageSelectByName(page, 'Task Type'), executionStage: pageSelectByName(page, 'Execution Stage'), pipelineStage: pageSelectByName(page, 'Pipeline Stage'), prStatus: pageSelectByName(page, 'PR Status'), githubLink: pageUrlByName(page, 'GitHub Link'), creativeLink: pageUrlByName(page, 'Creative Link'), previewUrl: pageUrlByName(page, 'Preview URL'), executionLog: pageRichTextByName(page, 'Execution Log'), storeTheme: pageRichTextByName(page, 'Store / Theme'), lastUpdated: pageDateByName(page, 'Last Updated'), assignees: (prop(page, 'Assignee')?.people || []).map(person => ({ id: person.id, name: person.name || '' })), status: pageSelectByName(page, 'Status'), priority: pageSelectByName(page, 'Priority'), notionUrl: page.url })) }
function mapFindings(pages) { return pages.map(page => ({ id: page.id, company: pageSelectByName(page, 'Company'), title: pageTitleByName(page), impact: pageRichTextByName(page, 'Impact'), owner: pageSelectByName(page, 'Suggested Owner'), status: pageSelectByName(page, 'Status'), notionUrl: page.url })) }
function mapReports(pages) { return pages.map(page => ({ id: page.id, company: pageSelectByName(page, 'Company'), title: pageTitleByName(page, 'Title'), agent: pageSelectByName(page, 'Agent'), time: pageDateByName(page, 'Date'), notionUrl: page.url })) }
function mapApprovals(pages) { return pages.map(page => ({ id: page.id, company: pageSelectByName(page, 'Company'), action: pageTitleByName(page), requestedBy: pageSelectByName(page, 'Requested By') || 'notion', risk: pageSelectByName(page, 'Risk Level') || pageSelectByName(page, 'Status'), notionUrl: page.url })) }

function filterByCompany(items, company) {
  if (!company || company === 'All') return items
  return items.filter(item => normalizeCompany(item.company) === normalizeCompany(company))
}

export async function createFinding({ company = 'Lionzen', title, problem, evidence, impact, recommendation, owner = 'ops-manager', priority = 'Medium', sourceData = 'Shopify', createdBy = 'analyst', status = 'New' }) {
  const page = await createPage(dbMap.findings, {
    'Title': titlePropPayload(title), 'Company': selectPayload(normalizeCompany(company)), 'Problem': richTextPayload(problem || ''), 'Evidence': richTextPayload(evidence || ''), 'Impact': richTextPayload(impact || ''), 'Recommendation': richTextPayload(recommendation || ''), 'Suggested Owner': selectPayload(owner), 'Priority': selectPayload(priority), 'Source Data': selectPayload(sourceData), 'Created By Agent': selectPayload(createdBy), 'Status': selectPayload(status),
  })
  return { id: page.id, notionUrl: page.url, title, company: normalizeCompany(company) }
}

export async function createTask({ company = 'Lionzen', title, description = '', owner = 'ops-manager', source = 'main', fn = 'Ops', priority = 'Medium', status = 'Backlog', taskType = 'Ops', executor = 'Ops Manager', executionStage = 'Backlog', storeTheme = '', githubLink = '', creativeLink = '', prStatus = 'Not Started', assigneeIds = [], mediaReferences = [] }) {
  const page = await createPage(dbMap.tasks, {
    'Title': titlePropPayload(title), 'Status': selectPayload(status), 'Company': selectPayload(normalizeCompany(company)), 'Notes': chunkRichTextPayload(description), 'Owner Agent': selectPayload(owner), 'Source Agent': selectPayload(source), 'Task Type': selectPayload(taskType), 'Executor': selectPayload(executor), 'Execution Stage': selectPayload(executionStage), 'Store / Theme': richTextPayload(storeTheme), 'GitHub Link': urlPayload(githubLink), 'Creative Link': urlPayload(creativeLink), 'PR Status': selectPayload(prStatus), 'Priority': selectPayload(priority), 'Assignee': peoplePayload(assigneeIds),
  })
  if (mediaReferences.length) {
    const children = [headingBlock('Reference Images'), ...mediaReferences.filter(Boolean).map(imageBlock)]
    await appendChildren(page.id, children)
  }
  return { id: page.id, notionUrl: page.url, title, company: normalizeCompany(company) }
}
export async function createReport({ company = 'Lionzen', title, reportType = 'Daily Ops', agent = 'ops-manager', summary = '', priorities = '', blockers = '', decisionsNeeded = '' }) {
  const page = await createPage(dbMap.reports, {
    'Title': titlePropPayload(title), 'Company': selectPayload(normalizeCompany(company)), 'Report Type': selectPayload(reportType), 'Agent': selectPayload(agent), 'Date': datePayload(new Date().toISOString()), 'Summary': richTextPayload(summary), 'Priorities': richTextPayload(priorities), 'Blockers': richTextPayload(blockers), 'Decisions Needed': richTextPayload(decisionsNeeded),
  })
  return { id: page.id, notionUrl: page.url, title, company: normalizeCompany(company) }
}
export async function createApproval({ company = 'Lionzen', title, requestedBy = 'main', risk = 'Medium', summary = '', status = 'Pending' }) {
  const page = await createPage(dbMap.approvals, {
    'Title': titlePropPayload(title), 'Company': selectPayload(normalizeCompany(company)), 'Requested By': selectPayload(requestedBy), 'Risk Level': selectPayload(risk), 'Summary': richTextPayload(summary), 'Status': selectPayload(status), 'Date': datePayload(new Date().toISOString()),
  })
  return { id: page.id, notionUrl: page.url, title, company: normalizeCompany(company) }
}

export async function updateTaskState(pageId, updates = {}) {
  const properties = {}
  if (updates.status) properties['Status'] = selectPayload(updates.status)
  if (updates.executionStage) properties['Execution Stage'] = selectPayload(updates.executionStage)
  if (updates.pipelineStage) properties['Pipeline Stage'] = selectPayload(updates.pipelineStage)
  if (typeof updates.previewUrl === 'string') properties['Preview URL'] = urlPayload(updates.previewUrl)
  if (typeof updates.executionLog === 'string') properties['Execution Log'] = chunkRichTextPayload(updates.executionLog)
  if (updates.prStatus) properties['PR Status'] = selectPayload(updates.prStatus)
  if (typeof updates.storeTheme === 'string') properties['Store / Theme'] = richTextPayload(updates.storeTheme)
  properties['Last Updated'] = datePayload(new Date().toISOString())
  const page = await notion.pages.update({ page_id: pageId, properties })
  return { id: page.id, notionUrl: page.url }
}

export async function getNotionSnapshot(company = 'All') {
  if (!notion) return { connected: false, tasks: [], findings: [], reports: [], approvals: [], source: 'mock-fallback', errors: [] }
  const [tasks, findings, reports, _sops, approvals] = await Promise.all([
    safeLoad(dbMap.tasks, taskSeed, mapTasks),
    safeLoad(dbMap.findings, findingsSeed, mapFindings),
    safeLoad(dbMap.reports, reportsSeed, mapReports),
    safeLoad(dbMap.sops, sopsSeed, () => []),
    safeLoad(dbMap.approvals, approvalsSeed, mapApprovals),
  ])
  return {
    connected: tasks.ok || findings.ok || reports.ok || approvals.ok,
    tasks: filterByCompany(tasks.rows, company),
    findings: filterByCompany(findings.rows, company),
    reports: filterByCompany(reports.rows, company),
    approvals: filterByCompany(approvals.rows, company),
    source: 'notion-live',
    errors: [tasks.error, findings.error, reports.error, approvals.error].filter(Boolean),
  }
}
