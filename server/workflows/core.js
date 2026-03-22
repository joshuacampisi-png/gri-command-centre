import { createApproval, createFinding, createReport, createTask } from '../connectors/notion.js'
import { postRoleMessage } from '../connectors/slack.js'
import { normalizeCompany } from '../lib/companies.js'
import { buildStructuredTask, detectTaskType, makeTaskTitle } from '../lib/task-template.js'
import { inferTaskRouting } from '../lib/task-routing.js'
import { assigneeIdsForOwner } from '../lib/notion-assignees.js'
import { PIPELINE, appendExecutionLog } from '../lib/pipeline.js'

export async function workflowCreateFinding(input) {
  const company = normalizeCompany(input.company)
  const finding = await createFinding({ ...input, company })
  await postRoleMessage('analyst', `New finding created for ${company}: ${finding.title}\n${finding.notionUrl}`)
  return finding
}

export async function workflowCreateTask(input) {
  const company = normalizeCompany(input.company)
  const prompt = input.description || input.title
  const routing = inferTaskRouting(prompt)
  const titleTaskType = detectTaskType(prompt)
  const finalTitle = makeTaskTitle(input.title || prompt, titleTaskType)
  const structuredDescription = buildStructuredTask({
    company,
    prompt,
    creativeLink: input.creativeLink,
    referenceLinks: input.referenceLinks || [],
    mediaReferences: input.mediaReferences || []
  })

  const task = await createTask({
    ...input,
    title: finalTitle,
    company,
    description: structuredDescription,
    creativeLink: input.creativeLink || '',
    owner: routing.owner,
    fn: routing.fn,
    taskType: routing.taskType,
    executor: routing.executor,
    executionStage: routing.executionStage,
    prStatus: routing.prStatus,
    assigneeIds: assigneeIdsForOwner(routing.owner)
  })

  await postRoleMessage(routing.owner, `New task created for ${company}: ${task.title}\nExecutor: ${routing.executor}\n${task.notionUrl}`)
  return { ...task, routing }
}

export async function workflowConvertFindingToTask(input) {
  const company = normalizeCompany(input.company)
  const routing = inferTaskRouting(input.description || input.impact || input.title)
  const structuredDescription = buildStructuredTask({ company, prompt: input.description || input.impact || input.title })

  const task = await createTask({
    company,
    title: input.title,
    description: structuredDescription,
    owner: routing.owner,
    source: input.source || 'analyst',
    fn: routing.fn,
    priority: input.priority || 'Medium',
    status: 'Backlog',
    taskType: routing.taskType,
    executor: routing.executor,
    executionStage: routing.executionStage,
    prStatus: routing.prStatus,
    assigneeIds: assigneeIdsForOwner(routing.owner)
  })

  await postRoleMessage('handoffs', `Setback converted to task for ${company}\nSetback: ${input.title}\nExecutor: ${routing.executor}\nTask: ${task.title}\n${task.notionUrl}`)
  return { ...task, routing }
}

export async function workflowCreateReport(input) {
  const company = normalizeCompany(input.company)
  const report = await createReport({ ...input, company })
  await postRoleMessage(input.agent || 'ops-manager', `New report published for ${company}: ${report.title}\n${report.notionUrl}`)
  return report
}

export async function workflowCreateHandoff({ company='Lionzen', from='analyst', to='ops-manager', title, context='' }) {
  const c = normalizeCompany(company)
  const text = `Handoff\nCompany: ${c}\nFrom: ${from}\nTo: ${to}\nTitle: ${title}\nContext: ${context}`
  const sent = await postRoleMessage('handoffs', text)
  return { ok: true, company: c, sent }
}

export async function workflowCreateAlert({ company='Lionzen', title, severity='High', summary='' }) {
  const c = normalizeCompany(company)
  const sent = await postRoleMessage('alerts', `Alert (${severity})\nCompany: ${c}\n${title}\n${summary}`)
  return { ok: true, company: c, sent }
}

export async function workflowCreateApproval(input) {
  const company = normalizeCompany(input.company)
  const approval = await createApproval({ ...input, company })
  await postRoleMessage('main', `Approval requested for ${company}: ${approval.title}\n${approval.notionUrl}`)
  return approval
}
