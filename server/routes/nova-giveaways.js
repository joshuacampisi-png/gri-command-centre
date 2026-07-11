import express from 'express'
import { listGiveaways, addGiveaway, deleteGiveaway, giveawayTotals } from '../lib/nova-giveaways-store.js'

const router = express.Router()

router.get('/', (_req, res) => {
  const giveaways = listGiveaways()
  res.json({ giveaways, totals: giveawayTotals(giveaways) })
})

router.post('/', (req, res) => {
  const { product, qty, to, note, cost, retail } = req.body || {}
  if (!product || !String(product).trim()) return res.status(400).json({ error: 'product required' })
  addGiveaway({ product, qty, to, note, cost, retail })
  const giveaways = listGiveaways()
  res.json({ ok: true, giveaways, totals: giveawayTotals(giveaways) })
})

router.delete('/:id', (req, res) => {
  deleteGiveaway(req.params.id)
  const giveaways = listGiveaways()
  res.json({ ok: true, giveaways, totals: giveawayTotals(giveaways) })
})

export default router
