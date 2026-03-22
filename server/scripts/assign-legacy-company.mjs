import { Client } from '@notionhq/client'
import dotenv from 'dotenv'

dotenv.config({ path: new URL('../../.env', import.meta.url) })
const notion = new Client({ auth: process.env.NOTION_TOKEN })
const dbs = [
  process.env.NOTION_TASKS_DB,
  process.env.NOTION_FINDINGS_DB,
  process.env.NOTION_REPORTS_DB,
  process.env.NOTION_APPROVALS_DB,
  process.env.NOTION_SOPS_DB,
]

for (const database_id of dbs) {
  const db = await notion.databases.retrieve({ database_id })
  const ds = db.data_sources?.[0]?.id
  const rows = await notion.dataSources.query({ data_source_id: ds, page_size: 100 })
  for (const row of rows.results) {
    const company = row.properties?.Company?.select?.name
    if (!company) {
      await notion.pages.update({
        page_id: row.id,
        properties: {
          Company: { select: { name: 'Lionzen' } }
        }
      })
      console.log('updated', row.id)
    }
  }
}
