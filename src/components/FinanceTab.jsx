import { useState, useEffect, useCallback } from 'react'
import './finance-tab.css'

const API = '/api/finance'
const POLL_MS = 5 * 60 * 1000

// ── Formatters ───────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtAUD(n) {
  if (n == null || isNaN(n)) return '—'
  const sign = n < 0 ? '−' : ''
  return sign + '$' + Math.abs(Math.round(n)).toLocaleString('en-AU')
}

// Small figures keep cents (CAC, AOV); big figures drop them.
function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  if (Math.abs(n) >= 1000) return fmtAUD(n)
  const sign = n < 0 ? '−' : ''
  return sign + '$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function negAUD(n) {
  if (n == null || isNaN(n)) return '—'
  return '−' + fmtAUD(Math.abs(n)).replace('−', '')
}

function fmtInt(n) {
  if (n == null || isNaN(n)) return '—'
  return Math.round(n).toLocaleString('en-AU')
}

function signedInt(n) {
  if (n == null || isNaN(n)) return '—'
  return (n >= 0 ? '+' : '−') + Math.abs(Math.round(n)).toLocaleString('en-AU')
}

// Compact absolute dollars for headlines: 32800 → "$32.8k"
function fmtCompact(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1000) {
    const k = abs / 1000
    const s = k >= 100 ? Math.round(k).toLocaleString('en-AU') : k.toFixed(1).replace(/\.0$/, '')
    return '$' + s + 'k'
  }
  return '$' + Math.round(abs).toLocaleString('en-AU')
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(1) + '%'
}

// Fraction (0.25) → "25%"
function fmtFracPct(f) {
  if (f == null || isNaN(f)) return '—'
  const p = f * 100
  return (p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)) + '%'
}

function fmtX(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(1) + 'x'
}

function fmtXTrim(n) {
  if (n == null || isNaN(n)) return '—'
  const s = Number(n).toFixed(1)
  return (s.endsWith('.0') ? s.slice(0, -2) : s) + 'x'
}

function absPct(p) {
  if (p == null || isNaN(p)) return '—'
  return Math.abs(p).toFixed(1) + '%'
}

function upDown(p) {
  if (p == null || isNaN(p)) return '—'
  return p >= 0 ? 'up' : 'down'
}

function relTime(iso) {
  if (!iso) return '—'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (isNaN(s)) return '—'
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

function monthShort(m) {
  if (!m || typeof m !== 'string') return ''
  const idx = parseInt(m.split('-')[1], 10) - 1
  return MONTHS_SHORT[idx] || ''
}

function monthLabel(m) {
  if (!m || typeof m !== 'string') return ''
  const [y, mo] = m.split('-')
  const idx = parseInt(mo, 10) - 1
  return `${MONTHS_SHORT[idx] || ''} ${y}`
}

function monthLong(m) {
  if (!m || typeof m !== 'string') return ''
  const [y, mo] = m.split('-')
  const idx = parseInt(mo, 10) - 1
  return `${MONTHS_LONG[idx] || ''} ${y}`
}

function monthNameOnly(m) {
  if (!m || typeof m !== 'string') return ''
  const idx = parseInt(m.split('-')[1], 10) - 1
  return MONTHS_LONG[idx] || ''
}

// ── Small building blocks ────────────────────────────────────────────────────

function Skel({ w = '100%', h = 16, style }) {
  return <div className="fin-skel" style={{ width: w, height: h, ...style }} />
}

function Delta({ pct, invert = false, caption = 'vs prior period' }) {
  if (pct == null || isNaN(pct)) return <div className="fin-delta fin-delta-none">—</div>
  const good = invert ? pct <= 0 : pct >= 0
  return (
    <div className={`fin-delta ${good ? 'fin-delta-good' : 'fin-delta-bad'}`}>
      {pct >= 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
      {caption && <span className="fin-delta-caption">{caption}</span>}
    </div>
  )
}

function MetricCard({ label, value, valueClass = '', delta = null, caption = null, helper = null }) {
  return (
    <div className="fin-metric-card">
      <div className="fin-metric-label">{label}</div>
      <div className={`fin-metric-value ${valueClass}`}>{value}</div>
      {delta}
      {caption && <div className="fin-metric-caption">{caption}</div>}
      {helper && <div className="fin-metric-helper">{helper}</div>}
    </div>
  )
}

function TrendChip({ pct, label }) {
  if (pct == null || isNaN(pct)) return null
  const good = pct >= 0
  return (
    <span className={`fin-chip ${good ? 'fin-chip-good' : 'fin-chip-bad'}`}>
      {good ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}% {label}
    </span>
  )
}

// ── Sparkline (daily CM this month) ─────────────────────────────────────────

function Sparkline({ series, target }) {
  const W = 220
  const H = 56
  const pad = 4
  const clean = Array.isArray(series)
    ? series.filter(d => d && d.cm != null && !isNaN(d.cm))
    : []
  if (clean.length < 2) {
    return <div className="fin-spark-empty">Not enough daily data yet</div>
  }
  const vals = clean.map(d => d.cm)
  const domain = target != null && !isNaN(target) ? [...vals, target] : vals
  const min = Math.min(...domain)
  const max = Math.max(...domain)
  const span = max - min || 1
  const y = v => H - pad - ((v - min) / span) * (H - pad * 2)
  const x = i => pad + (i / (clean.length - 1)) * (W - pad * 2)
  const points = clean.map((d, i) => `${x(i).toFixed(1)},${y(d.cm).toFixed(1)}`).join(' ')

  return (
    <svg className="fin-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Daily contribution margin sparkline">
      {target != null && !isNaN(target) && (
        <line className="fin-spark-target" x1={pad} x2={W - pad} y1={y(target)} y2={y(target)} />
      )}
      <polyline className="fin-spark-line" points={points} />
      <circle className="fin-spark-dot" cx={x(clean.length - 1)} cy={y(vals[vals.length - 1])} r="2.5" />
    </svg>
  )
}

// ── 13-month CM bar chart ────────────────────────────────────────────────────

function MonthlyBars({ series }) {
  const [hover, setHover] = useState(null)
  if (!Array.isArray(series) || series.length === 0) return null

  const W = 760
  const H = 170
  const padT = 10
  const padB = 20
  const padL = 44
  const padR = 6
  const n = series.length
  const vals = series.map(m => (m && m.cm != null && !isNaN(m.cm) ? m.cm : 0))
  const maxV = Math.max(...vals, 1)
  const minV = Math.min(...vals, 0)
  const span = maxV - minV || 1
  const chartH = H - padT - padB
  const chartW = W - padL - padR
  const yOf = v => padT + ((maxV - v) / span) * chartH
  const zeroY = yOf(0)
  const slot = chartW / n
  const barW = Math.min(52, slot * 0.62)
  const ticks = [0, 25000, 50000, 100000].filter(t => t === 0 || t <= maxV)
  const isCurrent = (m, i) => (m && m.current != null ? !!m.current : i === n - 1)
  const hovered = hover != null ? series[hover] : null

  return (
    <div className="fin-bars-wrap" onMouseLeave={() => setHover(null)}>
      {hovered && (
        <div
          className="fin-bar-tip"
          style={{ left: `${Math.min(88, Math.max(12, ((padL + (hover + 0.5) * slot) / W) * 100))}%` }}
        >
          <div className="fin-bar-tip-month">{monthLabel(hovered.month)}</div>
          <div className="fin-bar-tip-row"><span>Revenue</span><strong>{fmtAUD(hovered.revenue)}</strong></div>
          <div className="fin-bar-tip-row"><span>CM</span><strong>{fmtAUD(hovered.cm)}</strong></div>
          <div className="fin-bar-tip-row"><span>Orders</span><strong>{fmtInt(hovered.orders)}</strong></div>
          <div className="fin-bar-tip-row"><span>Ad spend</span><strong>{fmtAUD(hovered.adSpend)}</strong></div>
        </div>
      )}
      <svg className="fin-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly contribution margin, last 13 months">
        {ticks.map(t => (
          <g key={t}>
            <line className="fin-gridline" x1={padL} x2={W - padR} y1={yOf(t)} y2={yOf(t)} />
            <text className="fin-axis-label" x={padL - 8} y={yOf(t) + 3} textAnchor="end">
              ${Math.round(t / 1000)}k
            </text>
          </g>
        ))}
        {series.map((m, i) => {
          const v = vals[i]
          const h = Math.max(2, (Math.abs(v) / span) * chartH)
          const bx = padL + i * slot + (slot - barW) / 2
          const by = v >= 0 ? zeroY - h : zeroY
          const cls = [
            'fin-bar',
            v < 0 ? 'fin-bar-neg' : '',
            isCurrent(m, i) ? 'fin-bar-current' : '',
            hover === i ? 'fin-bar-hover' : '',
          ].join(' ')
          return (
            <g key={m.month || i}>
              <rect
                className="fin-bar-hit"
                x={padL + i * slot} y={0} width={slot} height={H}
                onMouseEnter={() => setHover(i)}
              />
              <rect className={cls} x={bx} y={by} width={barW} height={h} rx="3" onMouseEnter={() => setHover(i)} />
              <text className="fin-bar-label" x={padL + i * slot + slot / 2} y={H - 5} textAnchor="middle">
                {monthShort(m.month)}
              </text>
            </g>
          )
        })}
        <line className="fin-bar-zero" x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} />
      </svg>
    </div>
  )
}

// ── Verdict banner ───────────────────────────────────────────────────────────

function VerdictBanner({ verdict, cashView }) {
  if (!verdict) return null
  const status = verdict.status || (verdict.makingMoney ? 'green' : 'red')
  const net = verdict.netProjectedEom
  const hasNet = net != null && !isNaN(net)
  const headline = verdict.makingMoney
    ? `YES — banking ${hasNet ? `${fmtCompact(net)}/mo` : 'money'}`
    : `NO — losing ${hasNet ? `${fmtCompact(net)}/mo` : 'money'} at current pace`
  const last = verdict.lastCompleteMonth
  return (
    <section className={`fin-card fin-verdict fin-verdict-${status}`}>
      <div className="fin-section-label">Are We Making Money? (business model)</div>
      <div className={`fin-verdict-answer fin-status-${status}`}>{headline}</div>
      {verdict.sentence && <div className="fin-verdict-sentence">{verdict.sentence}</div>}
      {last && (
        <div className="fin-verdict-last">
          {monthNameOnly(last.month)} (last complete month): revenue {fmtAUD(last.revenue)} · CM {fmtAUD(last.cm)} · net {fmtAUD(last.net)}
        </div>
      )}
      {cashView && cashView.projectedEom != null && (
        <div className={`fin-cashview fin-cashview-${cashView.status || 'amber'}`}>
          <span className="fin-cashview-label">CASH VIEW</span>
          <span className={`fin-cashview-amt fin-status-${cashView.status || 'amber'}`}>
            {cashView.projectedEom >= 0 ? '+' : ''}{fmtCompact(cashView.projectedEom)}/mo
          </span>
          {cashView.afterLoanProjected != null && cashView.loan?.remaining > 0 && (
            <span className="fin-cashview-after">
              → {cashView.afterLoanProjected >= 0 ? '+' : '−'}{fmtCompact(cashView.afterLoanProjected)}/mo once loan clears
            </span>
          )}
          <span className="fin-cashview-note">
            Bank-account reality — stock already paid for (no COGS), {fmtFracPct(cashView.loanPct)} Shopify remittance counted while the loan runs.
          </span>
          {cashView.loan?.remaining > 0 && (
            <span className="fin-cashview-note">
              Loan: {fmtAUD(cashView.loan.remaining)} left · {fmtAUD(cashView.loan.monthlyRemittance)}/mo remittance · clears in ~{cashView.loan.monthsToPayoff} months.
              {cashView.stock?.retailValue > 0 && (
                <> Stock on hand: {fmtCompact(cashView.stock.retailValue)} retail ≈ {cashView.stock.runwayMonths} months of sales, already paid for.</>
              )}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

// ── Spend vs Revenue grouped bars ────────────────────────────────────────────

function monthOutgoings(m) {
  return (m.adSpend || 0) + (m.capitalWithheld || 0) + (m.tax || 0) + (m.fixed || 0)
}

function SpendVsRevenue({ series }) {
  const [hover, setHover] = useState(null)
  const months = Array.isArray(series) ? series.filter(m => m && (m.complete || m.current)) : []
  if (months.length === 0) return null

  const W = 760
  const H = 200
  const padT = 12
  const padB = 20
  const padL = 44
  const padR = 6
  const n = months.length
  const maxV = Math.max(...months.map(m => Math.max(m.revenue || 0, monthOutgoings(m))), 1)
  const chartH = H - padT - padB
  const chartW = W - padL - padR
  const slot = chartW / n
  const groupW = Math.min(48, slot * 0.64)
  const barW = Math.max(4, groupW / 2 - 1.5)
  const yOf = v => padT + chartH - (Math.max(0, v) / maxV) * chartH
  const baseY = padT + chartH
  const ticks = [0, 25000, 50000, 100000].filter(t => t === 0 || t <= maxV)
  const lastComplete = [...months].reverse().find(m => m.complete)
  const hovered = hover != null ? months[hover] : null

  return (
    <section className="fin-card fin-svr">
      <div className="fin-svr-head">
        <span className="fin-section-label">Spend vs Revenue</span>
        <div className="fin-legend">
          <span className="fin-legend-item"><span className="fin-swatch fin-swatch-green" />Revenue</span>
          <span className="fin-legend-item"><span className="fin-swatch fin-swatch-red" />Total outgoings</span>
        </div>
      </div>
      <div className="fin-bars-wrap" onMouseLeave={() => setHover(null)}>
        {hovered && (
          <div
            className="fin-bar-tip"
            style={{ left: `${Math.min(88, Math.max(12, ((padL + (hover + 0.5) * slot) / W) * 100))}%` }}
          >
            <div className="fin-bar-tip-month">{monthLabel(hovered.month)}{hovered.current ? ' · MTD' : ''}</div>
            <div className="fin-bar-tip-row"><span>Revenue</span><strong>{fmtAUD(hovered.revenue)}</strong></div>
            <div className="fin-bar-tip-row"><span>Ad spend</span><strong>{fmtAUD(hovered.adSpend)}</strong></div>
            <div className="fin-bar-tip-row"><span>Capital</span><strong>{fmtAUD(hovered.capitalWithheld)}</strong></div>
            <div className="fin-bar-tip-row"><span>Tax</span><strong>{fmtAUD(hovered.tax)}</strong></div>
            <div className="fin-bar-tip-row"><span>Fixed</span><strong>{fmtAUD(hovered.fixed)}</strong></div>
            <div className="fin-bar-tip-row">
              <span>Net</span>
              <strong className={(hovered.net ?? 0) >= 0 ? 'fin-val-green' : 'fin-val-red'}>{fmtAUD(hovered.net)}</strong>
            </div>
          </div>
        )}
        <svg className="fin-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly revenue vs total outgoings">
          {ticks.map(t => (
            <g key={t}>
              <line className="fin-gridline" x1={padL} x2={W - padR} y1={yOf(t)} y2={yOf(t)} />
              <text className="fin-axis-label" x={padL - 8} y={yOf(t) + 3} textAnchor="end">
                ${Math.round(t / 1000)}k
              </text>
            </g>
          ))}
          {months.map((m, i) => {
            const rev = m.revenue || 0
            const out = monthOutgoings(m)
            const gx = padL + i * slot + (slot - groupW) / 2
            const revH = Math.max(2, (rev / maxV) * chartH)
            const outH = Math.max(2, (out / maxV) * chartH)
            return (
              <g key={m.month || i}>
                <rect
                  className="fin-bar-hit"
                  x={padL + i * slot} y={0} width={slot} height={H}
                  onMouseEnter={() => setHover(i)}
                />
                <rect
                  className={`fin-svr-bar-rev ${m.current ? 'fin-svr-bar-current' : ''} ${hover === i ? 'fin-bar-hover' : ''}`}
                  x={gx} y={baseY - revH} width={barW} height={revH} rx="2"
                  onMouseEnter={() => setHover(i)}
                />
                <rect
                  className={`fin-svr-bar-out ${hover === i ? 'fin-bar-hover' : ''}`}
                  x={gx + barW + 3} y={baseY - outH} width={barW} height={outH} rx="2"
                  onMouseEnter={() => setHover(i)}
                />
                <text className="fin-bar-label" x={padL + i * slot + slot / 2} y={H - 5} textAnchor="middle">
                  {monthShort(m.month)}
                </text>
              </g>
            )
          })}
          <line className="fin-bar-zero" x1={padL} x2={W - padR} y1={baseY} y2={baseY} />
        </svg>
      </div>
      {lastComplete && (
        <div className="fin-svr-summary">
          Last complete month: revenue {fmtAUD(lastComplete.revenue)} vs total outgoings {fmtAUD(monthOutgoings(lastComplete))} → net{' '}
          <span className={(lastComplete.net ?? 0) >= 0 ? 'fin-val-green' : 'fin-val-red'}>{fmtAUD(lastComplete.net)}</span>
        </div>
      )}
    </section>
  )
}

// ── Monthly P&L table ────────────────────────────────────────────────────────

function PnlTable({ series }) {
  const months = Array.isArray(series) ? series.filter(m => m && (m.complete || m.current)) : []
  if (months.length === 0) return null
  const rows = [...months].reverse()
  return (
    <section className="fin-card fin-pnl">
      <div className="fin-section-label fin-pnl-title">Monthly P&amp;L</div>
      <div className="fin-pnl-scroll">
        <table className="fin-table fin-pnl-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Revenue</th>
              <th>Ad spend</th>
              <th>CM</th>
              <th>Capital 25%</th>
              <th>Tax 5%</th>
              <th>Fixed</th>
              <th>NET</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.month}>
                <td className="fin-pnl-month">
                  {monthLabel(m.month)}
                  {m.current && <span className="fin-tag-mtd">MTD</span>}
                </td>
                <td className="fin-td-num">{fmtAUD(m.revenue)}</td>
                <td className="fin-td-num">{fmtAUD(m.adSpend)}</td>
                <td className="fin-td-num">{fmtAUD(m.cm)}</td>
                <td className="fin-td-num">{fmtAUD(m.capitalWithheld)}</td>
                <td className="fin-td-num">{fmtAUD(m.tax)}</td>
                <td className="fin-td-num">{fmtAUD(m.fixed)}</td>
                <td className={`fin-td-num fin-pnl-net ${(m.net ?? 0) >= 0 ? 'fin-val-green' : 'fin-val-red'}`}>
                  {fmtAUD(m.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fin-note">
        Months before the Shopify read_all_orders scope was granted have no order history and are hidden.
      </p>
    </section>
  )
}

// ── LTGP:nCAC card with window selector ─────────────────────────────────────

const LTGP_WINDOWS = ['30', '60', '90', '180', '365']

function LtgpCard({ data }) {
  const [win, setWin] = useState('90')
  const windows = data?.windows || {}
  const val = windows[win]
  return (
    <div className="fin-metric-card fin-ltgp-card">
      <div className="fin-metric-label">LTGP:nCAC</div>
      <div className="fin-pill-row">
        {LTGP_WINDOWS.map(k => (
          <button
            key={k}
            type="button"
            className={`fin-pill ${win === k ? 'fin-pill-active' : ''}`}
            onClick={() => setWin(k)}
          >
            {k}d
          </button>
        ))}
      </div>
      <div className="fin-metric-value">{fmtXTrim(val)}</div>
      <div className="fin-metric-caption">
        {data?.gpPerCustomer90d != null && !isNaN(data.gpPerCustomer90d)
          ? `${fmtAUD(data.gpPerCustomer90d)}/customer at 90d`
          : '—'}
      </div>
      <div className="fin-metric-helper">Gross profit ÷ nCAC within window. Above 5x = strong</div>
    </div>
  )
}

// ── Fixed costs editor ───────────────────────────────────────────────────────

function OutgoingsEditor({ config, configError, onRetryConfig, onSaved }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [taxPct, setTaxPct] = useState('')
  const [capPct, setCapPct] = useState('')
  const [cmTarget, setCmTarget] = useState('')
  const [gmPct, setGmPct] = useState('')
  const [auspostWk, setAuspostWk] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [deriving, setDeriving] = useState(false)
  const [deriveResult, setDeriveResult] = useState(null)

  const deriveMargin = async () => {
    setDeriving(true)
    setDeriveResult(null)
    try {
      const res = await fetch(`${API}/derive-margin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true }),
      })
      const json = await res.json()
      if (!res.ok || json.ok === false) throw new Error(json.error || `Derive failed (${res.status})`)
      setDeriveResult(json)
      if (json.applied) onSaved(null) // refetch config + summary
    } catch (err) {
      setDeriveResult({ error: err.message || 'Derive failed' })
    }
    setDeriving(false)
  }

  // Hydrate the draft whenever a fresh config lands (mount + after save).
  useEffect(() => {
    if (!config) return
    setRows((config.fixedCosts || []).map(fc => ({
      key: fc.key || `fc_${Math.random().toString(36).slice(2, 9)}`,
      label: fc.label || '',
      amount: fc.amount != null ? String(fc.amount) : '',
      cadence: fc.cadence === 'weekly' ? 'weekly' : 'monthly',
    })))
    setTaxPct(config.taxPct != null ? String(+(config.taxPct * 100).toFixed(2)) : '')
    setCapPct(config.shopifyCapitalPct != null ? String(+(config.shopifyCapitalPct * 100).toFixed(2)) : '')
    setCmTarget(config.cmTargetMonthly != null ? String(config.cmTargetMonthly) : '')
    setGmPct(config.grossMarginPct != null ? String(+(config.grossMarginPct * 100).toFixed(2)) : '')
    setAuspostWk(config.auspostWeekly != null ? String(config.auspostWeekly) : '')
  }, [config])

  const updateRow = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const removeRow = i => setRows(rs => rs.filter((_, j) => j !== i))
  const addRow = () => setRows(rs => [
    ...rs,
    { key: `fc_${Date.now()}_${rs.length}`, label: '', amount: '', cadence: 'monthly' },
  ])

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        fixedCosts: rows.map((r, i) => ({
          key: r.key || `fc_${Date.now()}_${i}`,
          label: (r.label || '').trim() || 'Untitled',
          amount: Number(r.amount) || 0,
          cadence: r.cadence === 'weekly' ? 'weekly' : 'monthly',
        })),
        taxPct: (parseFloat(taxPct) || 0) / 100,
        shopifyCapitalPct: (parseFloat(capPct) || 0) / 100,
        cmTargetMonthly: String(cmTarget).trim() === '' ? null : Number(cmTarget),
        grossMarginPct: (parseFloat(gmPct) || 0) / 100,
        auspostWeekly: parseFloat(auspostWk) || 0,
        tntFullMargin: config?.tntFullMargin,
      }
      const res = await fetch(`${API}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || json.ok === false) throw new Error(json.error || `Save failed (${res.status})`)
      onSaved(json.config || payload)
    } catch (err) {
      setSaveError(err.message || 'Save failed')
    }
    setSaving(false)
  }

  return (
    <section className="fin-card fin-editor">
      <div className="fin-editor-head">
        <div>
          <h3 className="fin-card-title">Fixed Costs &amp; Settings</h3>
          {config?.updatedAt && (
            <div className="fin-editor-updated">Last saved {relTime(config.updatedAt)}</div>
          )}
        </div>
        <button type="button" className="fin-btn-ghost" onClick={() => setOpen(o => !o)}>
          {open ? 'Close' : 'Edit outgoings'}
        </button>
      </div>

      {open && (
        !config ? (
          <div className="fin-editor-body">
            {configError ? (
              <div className="fin-inline-error">
                <span>Couldn't load settings — {configError}</span>
                <button type="button" className="fin-btn-ghost" onClick={onRetryConfig}>Retry</button>
              </div>
            ) : (
              <Skel h={80} />
            )}
          </div>
        ) : (
          <div className="fin-editor-body">
            <div className="fin-editor-rows">
              <div className="fin-editor-row fin-editor-row-head">
                <span>Label</span><span>Amount</span><span>Cadence</span><span />
              </div>
              {rows.map((r, i) => (
                <div className="fin-editor-row" key={r.key}>
                  <input
                    className="fin-input"
                    type="text"
                    value={r.label}
                    placeholder="e.g. Warehouse rent"
                    onChange={e => updateRow(i, { label: e.target.value })}
                  />
                  <input
                    className="fin-input"
                    type="number"
                    min="0"
                    step="1"
                    value={r.amount}
                    placeholder="0"
                    onChange={e => updateRow(i, { amount: e.target.value })}
                  />
                  <select
                    className="fin-select"
                    value={r.cadence}
                    onChange={e => updateRow(i, { cadence: e.target.value })}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <button
                    type="button"
                    className="fin-btn-remove"
                    title="Remove"
                    onClick={() => removeRow(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="fin-btn-ghost fin-btn-add" onClick={addRow}>+ Add cost</button>
            </div>

            <div className="fin-editor-settings">
              <label className="fin-field">
                <span>Tax provision (%)</span>
                <input className="fin-input" type="number" min="0" step="0.1" value={taxPct} onChange={e => setTaxPct(e.target.value)} />
              </label>
              <label className="fin-field">
                <span>Shopify Capital (%)</span>
                <input className="fin-input" type="number" min="0" step="0.1" value={capPct} onChange={e => setCapPct(e.target.value)} />
              </label>
              <label className="fin-field">
                <span>CM target monthly ($)</span>
                <input className="fin-input" type="number" min="0" step="100" value={cmTarget} placeholder="Auto" onChange={e => setCmTarget(e.target.value)} />
              </label>
              <label className="fin-field">
                <span>Gross margin (%)</span>
                <input className="fin-input" type="number" min="0" step="0.1" value={gmPct} onChange={e => setGmPct(e.target.value)} />
              </label>
              <label className="fin-field">
                <span>AusPost shipping ($/week)</span>
                <input className="fin-input" type="number" min="0" step="10" value={auspostWk} onChange={e => setAuspostWk(e.target.value)} />
              </label>
            </div>

            {saveError && <div className="fin-inline-error"><span>{saveError}</span></div>}

            <div className="fin-editor-actions">
              <button type="button" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="fin-btn-ghost" onClick={deriveMargin} disabled={deriving}>
                {deriving ? 'Deriving from Shopify…' : 'Derive margin from Shopify costs'}
              </button>
            </div>
            {deriveResult && (
              <div className={`fin-derive-result ${deriveResult.error ? 'fin-derive-err' : ''}`}>
                {deriveResult.error
                  ? deriveResult.error
                  : `True blended margin: ${deriveResult.blendedMarginPct}% (covers ${deriveResult.coveragePct}% of ${fmtAUD(deriveResult.productRevenue)} product revenue, ${deriveResult.days} days). ${deriveResult.applied ? 'Applied — dashboard recalibrated.' : ''}${deriveResult.missingCosts?.length ? ` Missing costs on ${deriveResult.missingCosts.length} product(s): ${deriveResult.missingCosts.slice(0, 3).map(m => m.title.split(' — ')[0]).join(', ')}…` : ' All sold products have costs.'}`}
              </div>
            )}
          </div>
        )
      )}
    </section>
  )
}

// ── Skeleton screen ──────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <>
      <section className="fin-card">
        <Skel w="180px" h={12} />
        <div style={{ display: 'flex', gap: 24, marginTop: 16, alignItems: 'flex-end' }}>
          <Skel w="220px" h={48} />
          <Skel w="220px" h={56} />
        </div>
        <Skel h={8} style={{ marginTop: 24 }} />
        <Skel h={130} style={{ marginTop: 20 }} />
      </section>
      <div className="fin-grid fin-grid-kpi">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="fin-metric-card" key={i}>
            <Skel w="50%" h={11} />
            <Skel w="70%" h={28} style={{ marginTop: 8 }} />
            <Skel w="40%" h={12} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>
      <div className="fin-grid fin-grid-customer">
        {Array.from({ length: 8 }).map((_, i) => (
          <div className="fin-metric-card" key={i}>
            <Skel w="55%" h={11} />
            <Skel w="60%" h={26} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className="fin-two-col">
        <div className="fin-card"><Skel w="40%" h={13} /><Skel w="55%" h={36} style={{ marginTop: 14 }} /><Skel h={120} style={{ marginTop: 16 }} /></div>
        <div className="fin-card"><Skel w="40%" h={13} /><Skel h={160} style={{ marginTop: 16 }} /></div>
      </div>
    </>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function FinanceTab() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [config, setConfig] = useState(null)
  const [configError, setConfigError] = useState(null)
  const [, setTick] = useState(0) // keeps the relative timestamp fresh

  const fetchSummary = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch(`${API}/summary`)
      const json = await res.json()
      if (!res.ok || json.ok === false) throw new Error(json.error || `Request failed (${res.status})`)
      setSummary(json)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to load finance data')
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  const fetchConfig = useCallback(async () => {
    setConfigError(null)
    try {
      const res = await fetch(`${API}/config`)
      const json = await res.json()
      if (!res.ok || json.ok === false) throw new Error(json.error || `Request failed (${res.status})`)
      setConfig(json.config || null)
    } catch (err) {
      setConfigError(err.message || 'Failed to load config')
    }
  }, [])

  useEffect(() => {
    fetchSummary()
    fetchConfig()
  }, [fetchSummary, fetchConfig])

  useEffect(() => {
    const poll = setInterval(() => fetchSummary(true), POLL_MS)
    const clock = setInterval(() => setTick(t => t + 1), 60 * 1000)
    return () => { clearInterval(poll); clearInterval(clock) }
  }, [fetchSummary])

  const refresh = useCallback(() => {
    fetchSummary(true)
    fetchConfig()
  }, [fetchSummary, fetchConfig])

  const handleConfigSaved = useCallback((newConfig) => {
    // null = config changed server-side (e.g. derive-margin applied) — refetch it
    if (newConfig) setConfig(newConfig)
    else fetchConfig()
    fetchSummary(true)
  }, [fetchSummary, fetchConfig])

  const cm = summary?.cm || {}
  const formula = cm.formula || {}
  const kpis = summary?.kpis || {}
  const cust = summary?.customer || {}
  const out = summary?.outgoings || {}
  const np = summary?.netPosition || {}
  const lm = summary?.comparisons?.vsLastMonth
  const ly = summary?.comparisons?.vsLastYear
  const tnt = summary?.tnt || {}
  const ic = cust.incrementalCac || {}

  const pace = cm.pacePct
  const paceGood = pace != null && !isNaN(pace) && pace >= 90
  const paceWidth = pace != null && !isNaN(pace) ? Math.min(100, Math.max(0, pace)) : 0
  const badge = pace == null || isNaN(pace)
    ? { label: '—', cls: 'fin-badge-amber' }
    : pace >= 100
      ? { label: 'Ahead', cls: 'fin-badge-green' }
      : pace >= 90
        ? { label: 'On Target', cls: 'fin-badge-green' }
        : { label: 'Behind Monthly Target', cls: 'fin-badge-amber' }

  const fov = cust.fovCac?.value
  const fovClass = fov == null || isNaN(fov)
    ? ''
    : fov >= 3 ? 'fin-val-green' : fov >= 1 ? 'fin-val-amber' : 'fin-val-red'

  const header = (
    <div className="fin-header">
      <div>
        <h2 className="fin-title">Finance</h2>
        <div className="fin-subtitle">
          {summary
            ? `${monthLong(summary.month)} · Day ${summary.dayOfMonth ?? '—'} of ${summary.daysInMonth ?? '—'}`
            : 'Contribution margin, cashflow and outgoings'}
        </div>
      </div>
    </div>
  )

  // Full-page loading state
  if (loading && !summary) {
    return (
      <div className="fin-root">
        {header}
        <LoadingScreen />
      </div>
    )
  }

  // Full-page error state
  if (error && !summary) {
    return (
      <div className="fin-root">
        {header}
        <div className="fin-card fin-error-card">
          <h3>Couldn't load finance data</h3>
          <p>{error}</p>
          <button type="button" onClick={() => fetchSummary()}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fin-root">
      {header}

      {error && summary && (
        <div className="fin-inline-error fin-stale-bar">
          <span>Showing last loaded data — {error}</span>
          <button type="button" className="fin-btn-ghost" onClick={() => fetchSummary(true)}>Retry</button>
        </div>
      )}

      {/* ── 0. VERDICT BANNER ── */}
      <VerdictBanner verdict={summary?.verdict} cashView={summary?.cashView} />

      {/* ── 1. HERO — Contribution Margin ── */}
      <section className="fin-card fin-hero">
        <div className="fin-hero-top">
          <div className="fin-hero-main">
            <div className="fin-hero-labelrow">
              <span className="fin-section-label">Contribution Margin</span>
              <span className={`fin-badge ${badge.cls}`}>{badge.label}</span>
            </div>
            <div className="fin-hero-figure">
              <div className="fin-hero-value">{fmtAUD(cm.mtd)}</div>
              <div className="fin-hero-spark">
                <Sparkline series={cm.dailySeries} target={cm.dailyTarget} />
                <div className="fin-spark-caption">
                  Daily CM this month · target {fmtAUD(cm.dailyTarget)}/day
                </div>
                <div className="fin-spark-avg">{fmtAUD(cm.dailyAvg)}/day avg</div>
              </div>
            </div>
          </div>
          <div className="fin-hero-side">
            <div className="fin-hero-side-row">
              <span className="fin-hero-side-line">
                Projected EOM: <span className="fin-eom-value">{fmtAUD(cm.projectedEom)}</span>
                {' '}<span className="fin-hero-side-target">/ {fmtAUD(cm.monthlyTarget)}</span>
              </span>
            </div>
            <div className="fin-hero-side-row">
              <span className="fin-hero-side-line fin-hero-side-sub">
                Annualised: {fmtAUD(cm.annualised)} <span className="fin-hero-side-note">(rolling 3-month avg × 12)</span>
              </span>
            </div>
          </div>
        </div>

        <div className="fin-pace">
          <div className="fin-pace-labels">
            <span className="fin-pace-mtd">
              MTD Pace: {pace != null && !isNaN(pace) ? `${Math.round(pace)}% of target` : '—'}
            </span>
            <span className="fin-muted">Day {summary?.dayOfMonth ?? '—'} of {summary?.daysInMonth ?? '—'}</span>
          </div>
          <div className="fin-pace-track">
            <div
              className={`fin-pace-fill ${paceGood ? 'fin-pace-green' : 'fin-pace-amber'}`}
              style={{ width: `${paceWidth}%` }}
            />
          </div>
          <div className="fin-pace-dollars">
            <span>{fmtAUD(cm.mtd)}</span>
            <span>{fmtAUD(cm.mtdTargetPace)}</span>
          </div>
        </div>

        <MonthlyBars series={summary?.monthlySeries} />

        <div className="fin-chip-row">
          <TrendChip pct={cm.vsPriorMonthPct} label="vs prior period" />
          <TrendChip pct={cm.vsSameMonthLastYearPct} label="vs same month last year" />
          {cm.cmPctOfRevenue != null && (
            <span className="fin-chip fin-chip-neutral">
              CM {fmtPct(cm.cmPctOfRevenue)} of revenue
              {cm.cmPct6moAvg != null && !isNaN(cm.cmPct6moAvg) ? ` (6-month avg: ${fmtPct(cm.cmPct6moAvg)})` : ''}
            </span>
          )}
          {tnt.revenueMtd != null && (
            <span className="fin-chip fin-chip-muted">
              Hires (TNT + balloons): {fmtAUD(tnt.revenueMtd)} MTD ({fmtPct(tnt.pctOfRevenue)} of revenue) @ 100% pure profit
            </span>
          )}
        </div>

        <div className="fin-compare-lines">
          {lm && (
            <p className="fin-compare-line">
              vs last month: Orders {upDown(lm.ordersPct)} {absPct(lm.ordersPct)}. Ad spend {upDown(lm.adSpendPct)} {absPct(lm.adSpendPct)}.
            </p>
          )}
          {ly && (
            <p className="fin-compare-line">
              vs last year: Revenue {upDown(ly.revenuePct)} {absPct(ly.revenuePct)} ({fmtAUD(ly.revenueNow)} vs {fmtAUD(ly.revenueThen)}).
              {' '}Orders {upDown(ly.ordersPct)} {absPct(ly.ordersPct)} ({fmtInt(ly.ordersNow)} vs {fmtInt(ly.ordersThen)}).
              {' '}Ad spend {upDown(ly.adSpendPct)} {absPct(ly.adSpendPct)} ({fmtAUD(ly.adSpendNow)} vs {fmtAUD(ly.adSpendThen)}).
              {' '}AOV {upDown(ly.aovPct)} {absPct(ly.aovPct)} ({fmtMoney(ly.aovNow)} vs {fmtMoney(ly.aovThen)}).
            </p>
          )}
        </div>

        <div className="fin-formula">
          Net Sales {fmtAUD(formula.netSales)} − Cost of Delivery {fmtAUD(formula.costOfDelivery)} − Ad Spend {fmtAUD(formula.adSpend)}
        </div>
      </section>

      {/* ── 2. KPI ROW ── */}
      <section>
        <div className="fin-section-heading">Business</div>
        <div className="fin-grid fin-grid-kpi">
          <MetricCard
            label="Revenue"
            value={fmtAUD(kpis.revenue?.value)}
            delta={<Delta pct={kpis.revenue?.deltaPct} />}
          />
          <MetricCard
            label="Spend"
            value={fmtAUD(kpis.spend?.value)}
            delta={<Delta pct={kpis.spend?.deltaPct} invert />}
            caption={kpis.spend?.googleCounted
              ? `Meta ${fmtAUD(kpis.spend?.meta)} · Google ${fmtAUD(kpis.spend?.google)}`
              : `Meta ${fmtAUD(kpis.spend?.meta)} · Google ${fmtAUD(kpis.spend?.google)} (external — not counted)`}
          />
          <MetricCard
            label="MER"
            value={fmtX(kpis.mer?.value)}
            delta={<Delta pct={kpis.mer?.deltaPct} />}
          />
          <MetricCard
            label="AOV"
            value={fmtMoney(kpis.aov?.value)}
            delta={<Delta pct={kpis.aov?.deltaPct} />}
          />
        </div>
      </section>

      {/* ── 2b. SPEND VS REVENUE ── */}
      <SpendVsRevenue series={summary?.monthlySeries} />

      {/* ── 2c. MONTHLY P&L ── */}
      <PnlTable series={summary?.monthlySeries} />

      {/* ── 3. CUSTOMER METRICS ── */}
      <section>
        <div className="fin-section-heading fin-heading-purple">Customer Metrics</div>
        <div className="fin-grid fin-grid-customer">
          <MetricCard
            label="nCAC"
            value={fmtMoney(cust.ncac?.value)}
            delta={<Delta pct={cust.ncac?.deltaPct} invert />}
            helper="Lower is better"
          />
          <MetricCard
            label="Incremental CAC"
            value={ic.value != null && !isNaN(ic.value) ? fmtMoney(ic.value) : '—'}
            caption={`Δ spend ${fmtAUD(ic.deltaSpend)} · Δ customers ${signedInt(ic.deltaCustomers)}`}
          />
          <MetricCard
            label="Adjusted CAC"
            value={fmtMoney(cust.adjustedCac?.value)}
            delta={<Delta pct={cust.adjustedCac?.deltaPct} invert />}
          />
          <MetricCard
            label="FOV/CAC"
            value={fmtX(fov)}
            valueClass={fovClass}
            delta={<Delta pct={cust.fovCac?.deltaPct} />}
            helper="≥ 3.0x = first order profitable"
          />
          <LtgpCard data={cust.ltgpNcac} />
          <MetricCard
            label="New Customers"
            value={fmtInt(cust.newCustomers?.value)}
            delta={<Delta pct={cust.newCustomers?.deltaPct} />}
          />
          <MetricCard
            label="Repeat Rate"
            value={fmtPct(cust.repeatRate?.value)}
            delta={<Delta pct={cust.repeatRate?.deltaPct} />}
          />
          <MetricCard
            label="aMER"
            value={fmtX(cust.amer?.value)}
            delta={<Delta pct={cust.amer?.deltaPct} />}
          />
        </div>
      </section>

      {/* ── 4. BUSINESS HEALTH / NET POSITION ── */}
      <section>
        <div className="fin-section-heading">Business Health</div>
        <div className="fin-two-col">
          <div className="fin-card">
            <h3 className="fin-card-title">Net Position (after all outgoings)</h3>
            <div className={`fin-netpos-value fin-status-${np.status || 'green'}`}>{fmtAUD(np.mtd)}</div>
            <div className="fin-netpos-sub">
              Projected EOM: <strong>{fmtAUD(np.projectedEom)}</strong>
            </div>
            <ul className="fin-waterfall">
              <li>
                <span>Contribution Margin</span>
                <span className="fin-wf-amt">{fmtAUD(cm.mtd)}</span>
              </li>
              {out.shopifyCapitalPct > 0 && (
                <li>
                  <span>less Shopify Capital withheld from payouts ({fmtFracPct(out.shopifyCapitalPct)} of revenue)</span>
                  <span className="fin-wf-amt fin-wf-neg">{negAUD(out.shopifyCapitalMtd)}</span>
                </li>
              )}
              <li>
                <span>less Tax provision ({fmtFracPct(out.taxPct)})</span>
                <span className="fin-wf-amt fin-wf-neg">{negAUD(out.taxMtd)}</span>
              </li>
              <li>
                <span>less Fixed outgoings (MTD share of {fmtAUD(out.fixedTotal)}/mo)</span>
                <span className="fin-wf-amt fin-wf-neg">{negAUD(out.fixedMtd != null ? out.fixedMtd : out.fixedTotal)}</span>
              </li>
              <li className="fin-wf-net">
                <span>Net</span>
                <span className={`fin-wf-amt fin-status-${np.status || 'green'}`}>{fmtAUD(np.mtd)}</span>
              </li>
            </ul>
          </div>

          <div className="fin-card">
            <h3 className="fin-card-title">Monthly Outgoings</h3>
            <table className="fin-table">
              <tbody>
                {(out.fixed || []).map(f => (
                  <tr key={f.key || f.label}>
                    <td>{f.label}</td>
                    <td className="fin-td-muted">
                      {f.cadence === 'weekly' ? `${fmtAUD(f.amount)}/wk` : 'Monthly'}
                    </td>
                    <td className="fin-td-num">{fmtAUD(f.amountMonthly)}</td>
                  </tr>
                ))}
                <tr className="fin-row-subtotal">
                  <td>Fixed subtotal</td>
                  <td />
                  <td className="fin-td-num">{fmtAUD(out.fixedTotal)}</td>
                </tr>
                <tr>
                  <td>Ad spend (Meta — Google paid externally)</td>
                  <td className="fin-td-muted">MTD</td>
                  <td className="fin-td-num">{fmtAUD(out.adSpendMtd)}</td>
                </tr>
                <tr>
                  <td>Tax provision ({fmtFracPct(out.taxPct)})</td>
                  <td className="fin-td-muted">MTD</td>
                  <td className="fin-td-num">{fmtAUD(out.taxMtd)}</td>
                </tr>
                <tr>
                  <td>AusPost shipping <span className="fin-tag-incm">in CM</span></td>
                  <td className="fin-td-muted">{fmtAUD(out.auspostWeekly)}/wk</td>
                  <td className="fin-td-num">{fmtAUD(out.auspostMonthly)}</td>
                </tr>
                <tr className="fin-row-subtotal">
                  <td>Total outgoings</td>
                  <td className="fin-td-muted">MTD</td>
                  <td className="fin-td-num">{fmtAUD(out.totalMtd)}</td>
                </tr>
                <tr className="fin-row-total">
                  <td>Projected monthly total</td>
                  <td />
                  <td className="fin-td-num">{fmtAUD(out.totalMonthlyProjected)}</td>
                </tr>
                {out.shopifyCapitalPct > 0 && (
                  <tr>
                    <td colSpan={2} className="fin-td-muted">
                      Withheld from income — Shopify Capital ({fmtFracPct(out.shopifyCapitalPct)} of revenue, taken before payout)
                    </td>
                    <td className="fin-td-num fin-td-muted">{fmtAUD(out.shopifyCapitalMtd)} MTD</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="fin-note">
              AusPost is counted inside Cost of Delivery (already reflected in the contribution margin), so it is listed here for visibility but not added to the totals twice. Shopify Capital is excluded from this model view — the loan bought the stock being sold, so product COGS already covers it (see the cash view up top for the bank-account reality while the loan runs).
            </p>
          </div>
        </div>
      </section>

      {/* ── 5. FIXED COSTS EDITOR ── */}
      <OutgoingsEditor
        config={config}
        configError={configError}
        onRetryConfig={fetchConfig}
        onSaved={handleConfigSaved}
      />

      <footer className="fin-footer">
        <span>Data fetched {relTime(summary?.dataFetchedAt)} · refreshes every 5 min</span>
        <button type="button" className="fin-btn-ghost" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </footer>
    </div>
  )
}
