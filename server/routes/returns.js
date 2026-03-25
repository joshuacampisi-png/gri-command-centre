import { Router } from 'express'
import { getAll, create, remove } from '../lib/returns-store.js'

const router = Router()

// GET /api/returns — list all returns
router.get('/', (_req, res) => {
  res.json({ ok: true, returns: getAll() })
})

// POST /api/returns — lodge a new return
router.post('/', (req, res) => {
  const { customer, order, amount, products, reason, date } = req.body
  if (!customer || !order || !amount || !products || !reason) {
    return res.status(400).json({ ok: false, error: 'All fields are required' })
  }
  const record = create({ customer, order, amount, products, reason, date })
  res.json({ ok: true, return: record })
})

// DELETE /api/returns/:id — remove a return
router.delete('/:id', (req, res) => {
  const removed = remove(req.params.id)
  res.json({ ok: removed, error: removed ? null : 'Not found' })
})

export default router
