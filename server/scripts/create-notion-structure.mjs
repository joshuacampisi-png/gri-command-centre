import { Client } from '@notionhq/client'
import dotenv from 'dotenv'

dotenv.config({ path: new URL('../../.env', import.meta.url) })

const notion = new Client({ auth: process.env.NOTION_TOKEN })
const parentPageId = '325ec97847ea80609e43cbf52a3fd067'

async function createDatabase({ title, properties }) {
  return notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: title } }],
    initial_data_source: {
      properties,
    },
  })
}

async function createPage(databaseId, properties) {
  return notion.pages.create({ parent: { database_id: databaseId }, properties })
}

const schemas = {
  tasks: {
    title: 'Tasks',
    properties: {
      'Title': { title: {} },
      'Status': { select: { options: ['Backlog','Ready','In Progress','Blocked','Review','Done'].map(name => ({ name })) } },
      'Priority': { select: { options: ['Critical','High','Medium','Low'].map(name => ({ name })) } },
      'Owner Agent': { select: { options: ['main','shopify-dev','ops-manager','analyst'].map(name => ({ name })) } },
      'Source Agent': { select: { options: ['main','shopify-dev','ops-manager','analyst'].map(name => ({ name })) } },
      'Function': { select: { options: ['Web','Ops','Analysis','Command'].map(name => ({ name })) } },
      'Description': { rich_text: {} },
      'Due Date': { date: {} },
      'Approval Required': { checkbox: {} },
      'Approval Status': { select: { options: ['Not Needed','Pending','Approved','Rejected'].map(name => ({ name })) } },
      'Slack Thread URL': { url: {} },
      'Notes': { rich_text: {} },
    },
    seed: [
      {
        'Title': { title: [{ text: { content: 'Improve PDP mobile CTA visibility' } }] },
        'Status': { select: { name: 'Backlog' } },
        'Priority': { select: { name: 'High' } },
        'Owner Agent': { select: { name: 'shopify-dev' } },
        'Source Agent': { select: { name: 'analyst' } },
        'Function': { select: { name: 'Web' } },
        'Description': { rich_text: [{ text: { content: 'Increase clarity and tap visibility for mobile product-page call to action.' } }] },
        'Approval Required': { checkbox: true },
        'Approval Status': { select: { name: 'Pending' } },
      }
    ]
  },
  findings: {
    title: 'Findings',
    properties: {
      'Title': { title: {} },
      'Problem': { rich_text: {} },
      'Evidence': { rich_text: {} },
      'Impact': { rich_text: {} },
      'Recommendation': { rich_text: {} },
      'Suggested Owner': { select: { options: ['main','shopify-dev','ops-manager'].map(name => ({ name })) } },
      'Priority': { select: { options: ['Critical','High','Medium','Low'].map(name => ({ name })) } },
      'Source Data': { select: { options: ['Shopify'].map(name => ({ name })) } },
      'Created By Agent': { select: { options: ['analyst','main'].map(name => ({ name })) } },
      'Status': { select: { options: ['New','Reviewed','Converted to Task','Archived'].map(name => ({ name })) } },
    },
    seed: [
      {
        'Title': { title: [{ text: { content: 'Cart abandonment rising on mobile' } }] },
        'Problem': { rich_text: [{ text: { content: 'Mobile users appear to be dropping before purchase completion.' } }] },
        'Evidence': { rich_text: [{ text: { content: 'Seed finding for command-centre setup.' } }] },
        'Impact': { rich_text: [{ text: { content: 'Potential conversion leakage.' } }] },
        'Recommendation': { rich_text: [{ text: { content: 'Review mobile cart and PDP CTA friction.' } }] },
        'Suggested Owner': { select: { name: 'shopify-dev' } },
        'Priority': { select: { name: 'High' } },
        'Source Data': { select: { name: 'Shopify' } },
        'Created By Agent': { select: { name: 'analyst' } },
        'Status': { select: { name: 'New' } },
      }
    ]
  },
  reports: {
    title: 'Reports',
    properties: {
      'Title': { title: {} },
      'Report Type': { select: { options: ['Daily Ops','Executive Summary','Analyst Review','Incident'].map(name => ({ name })) } },
      'Agent': { select: { options: ['main','ops-manager','analyst','shopify-dev'].map(name => ({ name })) } },
      'Date': { date: {} },
      'Summary': { rich_text: {} },
      'Priorities': { rich_text: {} },
      'Blockers': { rich_text: {} },
      'Decisions Needed': { rich_text: {} },
      'Slack URL': { url: {} },
    },
    seed: [
      {
        'Title': { title: [{ text: { content: 'Daily Ops Report' } }] },
        'Report Type': { select: { name: 'Daily Ops' } },
        'Agent': { select: { name: 'ops-manager' } },
        'Date': { date: { start: new Date().toISOString() } },
        'Summary': { rich_text: [{ text: { content: 'Initial seeded report for the command centre.' } }] },
      }
    ]
  },
  sops: {
    title: 'SOPs',
    properties: {
      'Title': { title: {} },
      'Function': { select: { options: ['Web','Ops','Analysis','Command'].map(name => ({ name })) } },
      'Owner': { rich_text: {} },
      'Status': { select: { options: ['Draft','Active','Needs Update','Archived'].map(name => ({ name })) } },
      'Last Updated': { date: {} },
      'Document Link': { url: {} },
    },
    seed: [
      {
        'Title': { title: [{ text: { content: 'AI command centre startup review' } }] },
        'Function': { select: { name: 'Command' } },
        'Owner': { rich_text: [{ text: { content: 'Pablo Escobot' } }] },
        'Status': { select: { name: 'Draft' } },
        'Last Updated': { date: { start: new Date().toISOString() } },
      }
    ]
  },
  approvals: {
    title: 'Approvals',
    properties: {
      'Title': { title: {} },
      'Status': { select: { options: ['Pending','Approved','Rejected'].map(name => ({ name })) } },
      'Risk Level': { select: { options: ['Low','Medium','High'].map(name => ({ name })) } },
      'Requested By': { select: { options: ['main','shopify-dev','ops-manager','analyst'].map(name => ({ name })) } },
      'Summary': { rich_text: {} },
      'Date': { date: {} },
    },
    seed: [
      {
        'Title': { title: [{ text: { content: 'Approve initial production theme deploy policy' } }] },
        'Status': { select: { name: 'Pending' } },
        'Risk Level': { select: { name: 'Medium' } },
        'Requested By': { select: { name: 'main' } },
        'Summary': { rich_text: [{ text: { content: 'Seed approval item for command-centre workflow.' } }] },
        'Date': { date: { start: new Date().toISOString() } },
      }
    ]
  }
}

async function run() {
  const output = {}
  for (const key of Object.keys(schemas)) {
    const schema = schemas[key]
    const db = await createDatabase({ title: schema.title, properties: schema.properties })
    output[key] = db.id.replace(/-/g, '')
    for (const record of schema.seed) {
      await createPage(db.id, record)
    }
  }
  console.log(JSON.stringify(output, null, 2))
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
