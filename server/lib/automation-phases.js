export const AUTOMATION_PHASES = {
  current: 'phase-1',
  phases: [
    {
      id: 'phase-1',
      name: 'Structured Intake + Routing',
      status: 'active',
      capabilities: [
        'Telegram task intake',
        'Command centre task intake',
        'Unified Notion task flow',
        'Lean task briefs',
        'Assignee routing',
        'Notion notifications',
        'Preview-only Shopify connection'
      ]
    },
    {
      id: 'phase-2',
      name: 'Shopify Read/Inspect Layer',
      status: 'ready',
      capabilities: [
        'Fetch theme assets',
        'Inspect templates/sections',
        'Generate dev work packages',
        'Preview theme targeting only'
      ]
    },
    {
      id: 'phase-3',
      name: 'Controlled Preview Execution',
      status: 'ready',
      capabilities: [
        'Write to preview theme only',
        'Task-driven section/template updates',
        'Execution logging back to Notion',
        'QA checkpoints'
      ]
    },
    {
      id: 'phase-4',
      name: 'Automated Findings + Draft Execution',
      status: 'planned',
      capabilities: [
        'Scheduled audits',
        'Finding creation',
        'Automatic task generation',
        'Low-risk draft execution'
      ]
    },
    {
      id: 'phase-5',
      name: 'Full Automation Flywheel',
      status: 'planned',
      capabilities: [
        'Observe → Diagnose → Lodge → Execute → QA → Learn loop',
        'Human-gated publishing',
        'Continuous system improvement'
      ]
    }
  ]
}
