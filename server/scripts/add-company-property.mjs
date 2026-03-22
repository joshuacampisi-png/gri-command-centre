import { Client } from '@notionhq/client'
import dotenv from 'dotenv'

dotenv.config({ path: new URL('../../.env', import.meta.url) })
const notion = new Client({ auth: process.env.NOTION_TOKEN })
const companies = ['Lionzen', 'GRI', 'GBU']
const dbs = {
  tasks: process.env.NOTION_TASKS_DB,
  findings: process.env.NOTION_FINDINGS_DB,
  reports: process.env.NOTION_REPORTS_DB,
  approvals: process.env.NOTION_APPROVALS_DB,
  sops: process.env.NOTION_SOPS_DB,
}

for (const [label, database_id] of Object.entries(dbs)) {
  const db = await notion.databases.retrieve({ database_id })
  const dataSourceId = db.data_sources?.[0]?.id
  if (!dataSourceId) throw new Error(`No data source for ${label}`)
  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId })
  if (ds.properties?.Company) {
    console.log(label, 'already has Company')
    continue
  }
  await notion.dataSources.update({
    data_source_id: dataSourceId,
    properties: {
      Company: { select: { options: companies.map(name => ({ name })) } }
    }
  })
  console.log(label, 'updated with Company')
}
