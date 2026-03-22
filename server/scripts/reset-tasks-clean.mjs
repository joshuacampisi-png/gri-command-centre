import { Client } from '@notionhq/client'
import dotenv from 'dotenv'

dotenv.config({ path: new URL('../../.env', import.meta.url) })
const notion = new Client({ auth: process.env.NOTION_TOKEN })
const dbId = process.env.NOTION_TASKS_DB

const db = await notion.databases.retrieve({ database_id: dbId })
const ds = db.data_sources?.[0]?.id
if (!ds) throw new Error('No data source for tasks DB')

let cursor = undefined
let count = 0
while (true) {
  const res = await notion.dataSources.query({ data_source_id: ds, page_size: 100, start_cursor: cursor })
  for (const row of res.results) {
    await notion.pages.update({ page_id: row.id, archived: true })
    count++
  }
  if (!res.has_more) break
  cursor = res.next_cursor
}

console.log(JSON.stringify({ archivedTasks: count }, null, 2))
