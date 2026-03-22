export function isDeveloperTask(task = {}) {
  const type = String(task.taskType || '').toLowerCase()
  const exec = String(task.executor || '').toLowerCase()
  return type.includes('developer') || type.includes('shopify') || type.includes('dev') || exec.includes('dev')
}

export function assertDeveloperTask(task = {}) {
  if (!isDeveloperTask(task)) {
    throw new Error('Only developer-tagged tasks can enter preview/live execution pipeline')
  }
  return true
}
