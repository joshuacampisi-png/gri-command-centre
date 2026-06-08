import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const r = await c.query(`SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.name LIKE '%Cannon%'`)
for (const row of r) {
  const s = row.campaign?.status===2?'ENABLED':row.campaign?.status===3?'PAUSED':row.campaign?.status===4?'REMOVED':row.campaign?.status
  console.log(`${row.campaign?.id} [${s}] ${row.campaign?.name}`)
}
