export const NOTION_ASSIGNEES = {
  'ops-manager': ['79b39746-c430-4345-a8e6-1265fa4708a6'],
  'shopify-dev': ['45971014-ff9a-49d4-8a70-6a1df389a27d'],
  'graphic-designer': ['868fbbe1-00f5-4526-9197-6417433f2810']
}

export function assigneeIdsForOwner(owner = 'ops-manager') {
  return NOTION_ASSIGNEES[owner] || []
}
