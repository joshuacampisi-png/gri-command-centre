import express from 'express'
import { listSales, addSale, updateSale, deleteSale, totals } from '../lib/nova-sales-store.js'

const router = express.Router()

// GET /api/nova-sales — list all sales + totals
router.get('/', (_req, res) => {
  const sales = listSales()
  res.json({ sales, totals: totals(sales) })
})

// POST /api/nova-sales — add a sale { product, price, cost, qty, note, by }
router.post('/', (req, res) => {
  const { product, price, cost, qty, note, by, cohort, commission } = req.body || {}
  if (!product || !String(product).trim()) {
    return res.status(400).json({ error: 'product required' })
  }
  addSale({ product, price, cost, qty, note, by, cohort, commission })
  const sales = listSales()
  res.json({ ok: true, sales, totals: totals(sales) })
})

// PUT /api/nova-sales/:id — edit an existing sale
router.put('/:id', (req, res) => {
  const updated = updateSale(req.params.id, req.body || {})
  if (!updated) return res.status(404).json({ error: 'not found' })
  const sales = listSales()
  res.json({ ok: true, sales, totals: totals(sales) })
})

// DELETE /api/nova-sales/:id — remove a sale
router.delete('/:id', (req, res) => {
  deleteSale(req.params.id)
  const sales = listSales()
  res.json({ ok: true, sales, totals: totals(sales) })
})

export default router
