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
const updates = {}
if (!existing['Task Type']) updates['Task Type'] = { select: { options: ['Product Page','Theme','Bug','CRO','Ops','Report','Approval'].map(name => ({ name })) } }
if (!existing['Executor']) updates['Executor'] = { select: { options: ['Shopify Dev Agent','Ops Manager','Analyst','Josh','Human Dev','Designer','Contractor'].map(name => ({ name })) } }
if (!existing['Execution Stage']) updates['Execution Stage'] = { select: { options: ['Backlog','Ready','In Progress','Review','Approved','Live'].map(name => ({ name })) } }
if (!existing['Store / Theme']) updates['Store / Theme'] = { rich_text: {} }
if (!existing['GitHub Link']) updates['GitHub Link'] = { url: {} }
if (!existing['PR Status']) updates['PR Status'] = { select: { options: ['Not Started','In Progress','In Review','Approved','Merged'].map(name => ({ name })) } }
if (Object.keys(updates).length) {
  await notion.dataSources.update({ data_source_id: dataSourceId, properties: updates })
  console.log('updated tasks data source')
} else {
  console.log('tasks data source already has execution fields')
}
