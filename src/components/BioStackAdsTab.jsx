import { useState, useEffect, useCallback } from 'react'

// ── BioStack Business Constants ─────────────────────────────────────────────
// Placeholder economics — update once BioStack AOV / margin are confirmed.
// Do NOT copy GRI's numbers ($105 / 30% / $31.50) — different product.
const BIOSTACK = {
  aov: null,
  grossMargin: null,
  breakevenCPP: null,
  targetROAS: null,
}

const API = '/api/biostack'

const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 Days' },
  { key: '14d', label: '14 Days' },
  { key: '30d', label: '30 Days' },
]

function fmtCurrency(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '0'
  return Math.round(n).toLocaleString('en-AU')
}

const card = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
}

function StatusBadge({ status }) {
  const active = status === 'ACTIVE'
  const paused = status === 'PAUSED'
  const colour = active ? 'var(--green)' : paused ? 'var(--text-muted)' : 'var(--amber)'
  const bg = active ? 'var(--green-bg)' : paused ? 'var(--bg-canvas)' : 'var(--amber-bg)'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: colour, background: bg, padding: '2px 8px', borderRadius: 99 }}>
      {status}
    </span>
  )
}

function MetricTile({ label, value, sub }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function InsightCells({ ins }) {
  if (!ins) return <td colSpan={7} style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>No data in range</td>
  const cell = { padding: '8px 10px', fontSize: 13, color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap' }
  return (
    <>
      <td style={cell}>{fmtCurrency(ins.spend)}</td>
      <td style={cell}>{fmtNum(ins.purchases)}</td>
      <td style={cell}>{fmtCurrency(ins.purchaseValue)}</td>
      <td style={{ ...cell, fontWeight: 600 }}>{ins.roas ? ins.roas.toFixed(2) + 'x' : '—'}</td>
      <td style={cell}>{ins.purchases > 0 ? fmtCurrency(ins.cpa) : '—'}</td>
      <td style={cell}>{ins.ctr ? ins.ctr.toFixed(2) + '%' : '—'}</td>
      <td style={cell}>{fmtCurrency(ins.cpm)}</td>
    </>
  )
}

export function BioStackAdsTab() {
  const [status, setStatus] = useState(null)
  const [overview, setOverview] = useState(null)
  const [range, setRange] = useState('7d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [busy, setBusy] = useState(null)
  const [budgetEdit, setBudgetEdit] = useState(null) // { id, value }

  const load = useCallback(async (preset) => {
    setLoading(true)
    setError(null)
    try {
      const [statusRes, overviewRes] = await Promise.all([
        fetch(`${API}/status`).then(r => r.json()),
        fetch(`${API}/overview?preset=${preset}`).then(r => r.json()),
      ])
      setStatus(statusRes)
      if (overviewRes.error) throw new Error(overviewRes.error)
      setOverview(overviewRes)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(range) }, [load, range])

  async function toggleStatus(id, currentStatus, label) {
    const next = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    if (!window.confirm(`Set ${label} to ${next}?`)) return
    setBusy(id)
    try {
      const res = await fetch(`${API}/object/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      await load(range)
    } catch (err) {
      alert(`Failed: ${err.message}`)
    } finally {
      setBusy(null)
    }
  }

  async function saveBudget(id) {
    const value = Number(budgetEdit?.value)
    if (!value || value <= 0) { setBudgetEdit(null); return }
    setBusy(id)
    try {
      const res = await fetch(`${API}/object/${id}/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyBudget: value }),
      }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      setBudgetEdit(null)
      await load(range)
    } catch (err) {
      alert(`Failed: ${err.message}`)
    } finally {
      setBusy(null)
    }
  }

  const totals = overview?.account
  const headerCell = { padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Connection status */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>BioStack Ads</div>
        {status?.ok ? (
          <>
            <StatusBadge status={status.accountStatus} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {status.accountName} · {status.accountId} · {status.currency} · lifetime spend {fmtCurrency(status.lifetimeSpend)}
            </span>
          </>
        ) : status ? (
          <span style={{ fontSize: 12, color: 'var(--red)' }}>Not connected: {status.error}</span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Checking connection…</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {DATE_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: range === r.key ? 'var(--text)' : 'var(--bg-surface)',
                color: range === r.key ? 'var(--bg-surface)' : 'var(--text)',
              }}
            >{r.label}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && !overview && (
        <div style={{ ...card, color: 'var(--text-muted)', fontSize: 13 }}>Loading BioStack account…</div>
      )}

      {/* Account totals */}
      {totals && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <MetricTile label="Spend" value={fmtCurrency(totals.spend)} />
          <MetricTile label="Purchases" value={fmtNum(totals.purchases)} sub={`${fmtNum(totals.checkouts)} checkouts / ${fmtNum(totals.addToCarts)} ATC`} />
          <MetricTile label="Revenue (Meta)" value={fmtCurrency(totals.purchaseValue)} />
          <MetricTile label="ROAS" value={totals.roas ? totals.roas.toFixed(2) + 'x' : '—'} />
          <MetricTile label="CPP" value={totals.purchases > 0 ? fmtCurrency(totals.cpa) : '—'} sub={BIOSTACK.breakevenCPP ? `breakeven ${fmtCurrency(BIOSTACK.breakevenCPP)}` : 'economics TBD'} />
          <MetricTile label="CTR" value={totals.ctr ? totals.ctr.toFixed(2) + '%' : '—'} sub={`CPM ${fmtCurrency(totals.cpm)}`} />
        </div>
      )}

      {/* Campaigns */}
      {overview?.campaigns?.map(c => (
        <div key={c.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap' }}
            onClick={() => setExpanded(e => ({ ...e, [c.id]: !e[c.id] }))}
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded[c.id] ? '▾' : '▸'}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
            <StatusBadge status={c.status} />
            {c.dailyBudget != null && (
              budgetEdit?.id === c.id ? (
                <span onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="number"
                    value={budgetEdit.value}
                    onChange={e => setBudgetEdit({ id: c.id, value: e.target.value })}
                    style={{ width: 80, padding: '4px 6px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-canvas)', color: 'var(--text)' }}
                    autoFocus
                  />
                  <button onClick={() => saveBudget(c.id)} disabled={busy === c.id} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--green-bg)', color: 'var(--green)', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                  <button onClick={() => setBudgetEdit(null)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                </span>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setBudgetEdit({ id: c.id, value: c.dailyBudget }) }}
                  style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                >{fmtCurrency(c.dailyBudget)}/day ✎</button>
              )
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {c.insights && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {fmtCurrency(c.insights.spend)} · {fmtNum(c.insights.purchases)} sales · {c.insights.roas ? c.insights.roas.toFixed(2) + 'x' : '—'}
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); toggleStatus(c.id, c.status, `campaign "${c.name}"`) }}
                disabled={busy === c.id}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: c.status === 'ACTIVE' ? 'var(--bg-surface)' : 'var(--green-bg)',
                  color: c.status === 'ACTIVE' ? 'var(--red)' : 'var(--green)',
                }}
              >{busy === c.id ? '…' : c.status === 'ACTIVE' ? 'Pause' : 'Activate'}</button>
            </div>
          </div>

          {expanded[c.id] && (
            <div style={{ borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ ...headerCell, textAlign: 'left' }}>Ad set / Ad</th>
                    <th style={headerCell}>Spend</th>
                    <th style={headerCell}>Sales</th>
                    <th style={headerCell}>Revenue</th>
                    <th style={headerCell}>ROAS</th>
                    <th style={headerCell}>CPP</th>
                    <th style={headerCell}>CTR</th>
                    <th style={headerCell}>CPM</th>
                    <th style={headerCell}></th>
                  </tr>
                </thead>
                <tbody>
                  {c.adsets.map(as => (
                    <tr key={as.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-canvas)' }}>
                      <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        <StatusBadge status={as.status} /> {as.name}
                        {as.dailyBudget != null && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{fmtCurrency(as.dailyBudget)}/day</span>}
                      </td>
                      <InsightCells ins={as.insights} />
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          onClick={() => toggleStatus(as.id, as.status, `ad set "${as.name}"`)}
                          disabled={busy === as.id}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: as.status === 'ACTIVE' ? 'var(--red)' : 'var(--green)', cursor: 'pointer' }}
                        >{as.status === 'ACTIVE' ? 'Pause' : 'Activate'}</button>
                      </td>
                    </tr>
                  ))}
                  {c.ads.map(ad => (
                    <tr key={ad.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px 8px 28px', fontSize: 13, color: 'var(--text)' }}>
                        {ad.thumbnailUrl && <img src={ad.thumbnailUrl} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', verticalAlign: 'middle', marginRight: 6 }} />}
                        <StatusBadge status={ad.status} /> {ad.name}
                      </td>
                      <InsightCells ins={ad.insights} />
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          onClick={() => toggleStatus(ad.id, ad.status, `ad "${ad.name}"`)}
                          disabled={busy === ad.id}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: ad.status === 'ACTIVE' ? 'var(--red)' : 'var(--green)', cursor: 'pointer' }}
                        >{ad.status === 'ACTIVE' ? 'Pause' : 'Activate'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {overview && overview.campaigns?.length === 0 && (
        <div style={{ ...card, color: 'var(--text-muted)', fontSize: 13 }}>
          No campaigns found on the BioStack account.
        </div>
      )}
    </div>
  )
}

export default BioStackAdsTab
