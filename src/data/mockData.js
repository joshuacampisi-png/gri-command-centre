export const stats = [
  { label: 'Open Tasks', value: '24' },
  { label: 'Blocked', value: '3' },
  { label: 'Pending Approvals', value: '2' },
  { label: 'New Findings', value: '5' }
]

export const agents = [
  { id: 'main', name: 'Pablo Escobot', role: 'Master Agent', status: 'Online', workload: '7 active', permissions: 'Command / coding' },
  { id: 'shopify-dev', name: 'Shopify Web Developer', role: 'Theme code specialist', status: 'Active', workload: '4 active', permissions: 'Coding / no elevated' },
  { id: 'ops-manager', name: 'Operations Manager', role: 'Task + reporting owner', status: 'Waiting', workload: '9 tracked', permissions: 'Minimal / no exec' },
  { id: 'analyst', name: 'Analyst', role: 'Shopify data specialist', status: 'Review', workload: '4 findings', permissions: 'Minimal / no exec' }
]

export const tasks = [
  { title: 'Improve PDP mobile CTA visibility', owner: 'shopify-dev', status: 'In Progress', priority: 'High' },
  { title: 'Review rising cart abandonment signal', owner: 'analyst', status: 'Review', priority: 'High' },
  { title: 'Publish daily operations report', owner: 'ops-manager', status: 'Waiting', priority: 'Medium' },
  { title: 'Resolve checkout friction handoff', owner: 'main', status: 'Blocked', priority: 'Critical' }
]

export const findings = [
  { title: 'Cart abandonment rising on mobile', impact: 'Potential conversion leakage', owner: 'shopify-dev', status: 'Converted to task' },
  { title: 'PDP bounce rate elevated on top seller', impact: 'Revenue inefficiency', owner: 'ops-manager', status: 'Needs triage' },
  { title: 'Lack of documented theme QA flow', impact: 'Operational fragility', owner: 'ops-manager', status: 'Open' }
]

export const approvals = [
  { action: 'Approve production theme deployment', requestedBy: 'shopify-dev', risk: 'High' },
  { action: 'Approve permission expansion for staging deploy', requestedBy: 'main', risk: 'Medium' }
]

export const reports = [
  { title: 'Daily Ops Report', agent: 'ops-manager', time: 'Today · 6:00 PM' },
  { title: 'Executive Summary', agent: 'main', time: 'Today · 7:30 PM' },
  { title: 'Analyst Review', agent: 'analyst', time: 'Today · 4:15 PM' }
]
