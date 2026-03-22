export const PIPELINE = {
  LODGED: 'Lodged',
  ROUTED: 'Routed',
  WORKPACK_READY: 'Workpack Ready',
  PREVIEW_IN_PROGRESS: 'Preview In Progress',
  PREVIEW_READY: 'Preview Ready',
  NEEDS_APPROVAL: 'Needs Approval',
  APPROVED: 'Approved',
  LIVE: 'Live',
  FAILED: 'Failed'
}

export function appendExecutionLog(existing = '', entry = '') {
  const stamp = new Date().toISOString()
  const line = `[${stamp}] ${entry}`
  return existing ? `${existing}\n${line}` : line
}
