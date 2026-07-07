import express from 'express'
import { listSales, addSale, deleteSale, totals } from '../lib/nova-sales-store.js'

const router = express.Router()

// GET /api/nova-sales — list all sales + totals
router.get('/', (_req, res) => {
  const sales = listSales()
  res.json({ sales, totals: totals(sales) })
})

// POST /api/nova-sales — add a sale { product, price, cost, qty, note, by }
router.post('/', (req, res) => {
  const { product, price, cost, qty, note, by } = req.body || {}
  if (!product || !String(product).trim()) {
    return res.status(400).json({ error: 'product required' })
  }
  addSale({ product, price, cost, qty, note, by })
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
