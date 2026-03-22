import { Client } from '@notionhq/client'
import dotenv from 'dotenv'

dotenv.config({ path: new URL('../../.env', import.meta.url) })
const notion = new Client({ auth: process.env.NOTION_TOKEN })
const database_id = process.env.NOTION_TASKS_DB
const db = await notion.databases.retrieve({ database_id })
const dsId = db.data_sources?.[0]?.id
const ds = await notion.dataSources.retrieve({ data_source_id: dsId })
const props = ds.properties || {}
const updates = {}

function ensureOption(propName, optionName) {
  const prop = props[propName]
  if (!prop?.select) return
  const names = (prop.select.options || []).map(o => o.name)
  if (!names.includes(optionName)) {
    updates[propName] = { select: { options: [...prop.select.options, { name: optionName }] } }
  }
}

ensureOption('Executor', 'Graphic Designer Agent')
ensureOption('Task Type', 'Creative')

if (Object.keys(updates).length) {
  await notion.dataSources.update({ data_source_id: dsId, properties: updates })
  console.log('updated design options')
} else {
  console.log('design options already present')
}
