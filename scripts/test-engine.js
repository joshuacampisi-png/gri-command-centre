import 'dotenv/config'
import { buildEngineSnapshot, formatEngineForTelegram } from '../server/lib/gads-dominance-engine.js'

const s = await buildEngineSnapshot({ skipCache: true })
console.log('Today:', s.today.date, 'roas:', s.today.roas.toFixed(2))
console.log('Yesterday:', s.yesterday?.date, s.yesterday?.dow, s.yesterday?.roas?.toFixed(2) + 'x')
console.log('7d:', s.windows.last7.spend.toFixed(0), '→', s.windows.last7.val.toFixed(0), '=', s.windows.last7.roas.toFixed(2) + 'x')
console.log('30d:', s.windows.last30.spend.toFixed(0), '→', s.windows.last30.val.toFixed(0), '=', s.windows.last30.roas.toFixed(2) + 'x')
console.log('Account IS:', JSON.stringify(s.accountIs))
console.log('Campaigns:', s.campaigns.length, '(enabled:', s.campaigns.filter(c => c.status === 'ENABLED').length + ')')
console.log('Recovery rows:', s.recovery.length)
console.log('Movers:', s.movers.topMovers.length, '· Fallers:', s.movers.topFallers.length)
console.log('Total daily budget:', s.totalDailyBudget)
console.log()
console.log('=== Telegram preview ===')
console.log(formatEngineForTelegram(s))
process.exit(0)
