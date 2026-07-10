import express from 'express'
import { listCohorts, addCohort, deleteCohort } from '../lib/nova-cohorts-store.js'

const router = express.Router()

router.get('/', (_req, res) => {
  res.json({ cohorts: listCohorts() })
})

router.post('/', (req, res) => {
  const { name, pct } = req.body || {}
  const cohort = addCohort({ name, pct })
  if (!cohort) return res.status(400).json({ error: 'name required' })
  res.json({ ok: true, cohorts: listCohorts() })
})

router.delete('/:id', (req, res) => {
  deleteCohort(req.params.id)
  res.json({ ok: true, cohorts: listCohorts() })
})

export default router
