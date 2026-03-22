import { Client } from '@notionhq/client'
import dotenv from 'dotenv'

dotenv.config({ path: new URL('../../.env', import.meta.url) })
const notion = new Client({ auth: process.env.NOTION_TOKEN })
const database_id = process.env.NOTION_TASKS_DB
const db = await notion.databases.retrieve({ database_id })
const dataSourceId = db.data_sources?.[0]?.id
if (!dataSourceId) throw new Error('No data source for tasks DB')
const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId })
const existing = ds.properties || {}
if (!existing['Creative Link']) {
  await notion.dataSources.update({
    data_source_id: dataSourceId,
    properties: {
      'Creative Link': { url: {} }
    }
  })
  console.log('added Creative Link field')
} else {
  console.log('Creative Link already exists')
}
