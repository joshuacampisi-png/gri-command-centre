import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Line, ComposedChart
} from 'recharts'

// ── Dark Theme Colours (high contrast) ──────────────────────────────────────

const C = {
  bg: '#0D1117', card: '#161B22', border: '#30363D',
  text: '#E6EDF3', muted: '#8B949E',
  green: '#3FB950', red: '#F85149', yellow: '#D29922',
  blue: '#58A6FF', pink: '#E43F7B', purple: '#A371F7',
  orange: '#E3651D',
}

const API = '/api/flywheel'
const RANGES = [
  { key: 'today', label: 'Today (Live)' },
  { key: '7d', label: '7 Days' },
  { key: '14d', label: '14 Days' },
  { key: '30d', label: '30 Days' },
]

function fmt$(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n) { return n != null && !isNaN(n) ? n.toFixed(1) + '%' : '--' }
function fmtX(n) { return n != null && !isNaN(n) ? n.toFixed(2) + 'x' : '--' }

// ── Recommendation colours ──────────────────────────────────────────────────

const REC_COLORS = {
  SCALE: C.green, PROTECT: C.blue, KILL: C.red, REPLACE: C.pink, WATCH: C.yellow,
}
const ACTION_COLORS = {
  PAUSE: C.red, SCALE_BUDGET: C.green, REDUCE_BUDGET: C.yellow,
  REPLACE_CREATIVE: C.pink, REFRESH_AUDIENCE: C.purple,
}
const PRIORITY_COLORS = {
  URGENT: C.red, HIGH: C.orange, MEDIUM: C.yellow, LOW: C.muted,
}

// ── Main Component ──────────────────────────────────────────────────────────

export function AdsFlywheelTab() {
  const [range, setRange] = useState('today')
  const [d, setD] = useState(null) // dashboard data
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [expandedCamp, setExpandedCamp] = useState(null)
  const [scaleTarget, setScaleTarget] = useState(null) // { id, type:'adset'|'ad', name, budget, roas }
  const [scalePct, setScalePct] = useState(15)
  const [scaling, setScaling] = useState(false)
  const [scaleResult, setScaleResult] = useState(null)
  const [analyseAdName, setAnalyseAdName] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [analysis, setAnalysis] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dashboard?range=${range}`).then(r => r.json())
      if (res.ok) setD(res)
      else setError(res.error || 'Failed to load')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [range])

  useEffect(() => { setLoading(true); load(); const i = setInterval(load, 60000); return () => clearInterval(i) }, [load])

  // Action handlers
  async function resolveAlert(id) { await fetch(`${API}/alerts/${id}/resolve`, { method: 'POST' }); load() }
  async function approveAction(id) { await fetch(`${API}/actions/${id}/approve`, { method: 'POST' }); load() }
  async function rejectAction(id) { await fetch(`${API}/actions/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: '' }) }); load() }
  async function markDay(day) { await fetch(`${API}/rhythm/${day}/complete`, { method: 'POST' }); load() }
  async function triggerSync() { setSyncing(true); await fetch(`${API}/meta-sync/trigger`, { method: 'POST' }); setSyncing(false); load() }
  async function triggerBrief() { setGenerating(true); await fetch(`${API}/brief/generate`, { method: 'POST' }); setGenerating(false); load() }
  async function approveBrief(id) { await fetch(`${API}/brief/${id}/approve`, { method: 'POST' }); load() }
  async function runEngine() { await fetch(`${API}/decision-engine/run`, { method: 'POST' }); load() }

  async function executeScale(adSetId, pct) {
    setScaling(true); setScaleResult(null)
    try {
      const r = await fetch(`${API}/scale/${adSetId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ percentage: pct }) }).then(r => r.json())
      setScaleResult(r)
      if (r.ok) { setScaleTarget(null); load() }
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setScaling(false)
  }

  async function executeAction2(method, params) {
    try {
      const r = await fetch(`${API}/execute-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params }),
      }).then(r => r.json())
      setScaleResult(r.ok
        ? { ok: true, message: `${method.replace(/([A-Z])/g, ' $1').trim()}: ${r.message || 'Done'}` }
        : { ok: false, error: r.error }
      )
      load()
    } catch (e) {
      setScaleResult({ ok: false, error: e.message })
    }
  }

  async function analyseCreative(name) {
    setAnalysing(true); setAnalysis(null)
    try {
      const r = await fetch(`${API}/analyse-creative`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adName: name }) }).then(r => r.json())
      setAnalysis(r.ok ? r.analysis : { error: r.error })
    } catch (e) { setAnalysis({ error: e.message }) }
    setAnalysing(false)
  }

  if (loading) return <div style={{ background: C.bg, color: C.muted, padding: 60, textAlign: 'center', minHeight: '100vh' }}>Loading flywheel...</div>
  if (error && !d) return <div style={{ background: C.bg, color: C.red, padding: 40, minHeight: '100vh' }}>Error: {error}</div>

  const h = d?.hero || {}
  const today = new Date()
  const dayOfWeek = today.getDay()

  return (
    <div style={{ background: C.bg, color: C.text, padding: '20px 20px 40px', minHeight: '100vh', colorScheme: 'dark' }}>

      {/* ── 1. Header + Date Range ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text }}>Ads Intelligence Flywheel</h1>
          <p style={{ color: C.muted, margin: '2px 0 0', fontSize: 12 }}>Every purchase makes the next brief smarter</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{
              background: range === r.key ? C.blue : C.card,
              color: range === r.key ? '#fff' : C.muted,
              border: `1px solid ${range === r.key ? C.blue : C.border}`,
              borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: range === r.key ? 700 : 500, cursor: 'pointer',
            }}>{r.label}</button>
          ))}
          <button onClick={triggerSync} disabled={syncing} style={btnStyle(C.blue)}>{syncing ? 'Syncing...' : 'Sync Meta'}</button>
          <button onClick={runEngine} style={btnStyle(C.purple)}>Run AI Engine</button>
        </div>
      </div>

      {/* ── 2. Hero Metrics (6 cards) ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
        <HeroCard label="Shopify Revenue" value={fmt$(h.shopifyRevenue)} sub={`${h.shopifyOrders || 0} orders`} color={C.text} />
        <HeroCard label="Meta Spend" value={fmt$(h.metaSpend)} sub={`${h.metaPurchases || 0} attributed`} color={C.text} />
        <HeroCard label="ROAS" value={fmtX(h.roas)} sub="Breakeven: 2.22x" color={h.roas >= 2.22 ? C.green : C.red} />
        <HeroCard label="MER" value={fmtX(h.mer)} sub="Target: 3.0x" color={h.mer >= 3.0 ? C.green : h.mer >= 2.22 ? C.yellow : C.red} />
        <HeroCard label="CPA" value={fmt$(h.cpa)} sub="Target: $38 / Break: $47" color={h.cpa <= 38 ? C.green : h.cpa <= 47.25 ? C.yellow : C.red} />
        <HeroCard label="AOV" value={fmt$(h.aov)} sub="Target: $160" color={h.aov >= 160 ? C.green : h.aov >= 100 ? C.yellow : C.red} />
      </div>

      {/* Profit + AMER row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <HeroCard label="Gross Profit" value={fmt$(h.profit)} sub="Revenue x 45% margin minus spend" color={h.profit > 0 ? C.green : C.red} />
        <HeroCard label="AMER" value={h.amer != null ? h.amer.toFixed(0) + '%' : '--'} sub="Ad margin efficiency" color={h.amer > 0 ? C.green : C.red} />
        <HeroCard label="Bundle Rate" value={fmtPct(d?.aov?.bundleRate)} sub="Target: 30%+" color={(d?.aov?.bundleRate || 0) >= 30 ? C.green : C.yellow} />
        <HeroCard label="Orders Today" value={range === 'today' ? (h.shopifyOrders || 0) : '--'} sub="From Shopify" color={C.text} />
      </div>

      {/* ── Scale Result Toast ─────────────────────────────────────────────── */}
      {scaleResult && (
        <div style={{ ...card, marginBottom: 12, borderLeft: `3px solid ${scaleResult.ok ? C.green : C.red}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: C.text }}>{scaleResult.ok ? scaleResult.message : `Scale failed: ${scaleResult.error}`}</span>
            <button onClick={() => setScaleResult(null)} style={{ ...btnSm, color: C.muted }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* ── 3. Alerts + AI Actions ─────────────────────────────────────────── */}
      {(d?.alerts?.length > 0 || d?.pendingActions?.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          {d.pendingActions?.map(a => (
            <div key={a.id} style={{ ...card, borderLeft: `3px solid ${a.riskLevel === 'high' ? C.red : C.green}`, marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                    <span style={badge(a.aiConfidence >= 7 ? C.green : C.yellow)}>Confidence {a.aiConfidence}/10</span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{a.actionTitle}</span>
                  </div>
                  <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>{a.actionSummary}</p>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => approveAction(a.id)} style={btnStyle(C.green)}>Approve</button>
                  <button onClick={() => rejectAction(a.id)} style={btnStyle(C.red)}>Reject</button>
                </div>
              </div>
            </div>
          ))}
          {d.alerts?.slice(0, 5).map(a => (
            <div key={a.id} style={{ ...card, borderLeft: `3px solid ${a.severity === 'critical' ? C.red : a.severity === 'warning' ? C.yellow : C.blue}`, marginBottom: 4, padding: '8px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={badge(a.severity === 'critical' ? C.red : a.severity === 'warning' ? C.yellow : C.blue)}>{a.severity}</span>
                  <span style={{ fontSize: 13, color: C.text }}>{a.title}</span>
                </div>
                <button onClick={() => resolveAlert(a.id)} style={btnSm}>Resolve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 4. Campaign Table (expandable with surgical actions) ────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>Campaign Health</h2>
        <div style={card}>
          <table style={tbl}>
            <thead><tr>
              <th style={th}></th><th style={th}>Campaign</th><th style={th}>Budget/day</th>
              <th style={th}>Spend</th><th style={th}>Purchases</th><th style={th}>CPA</th>
              <th style={th}>Freq</th><th style={th}>Score</th><th style={th}>Status</th><th style={th}>Actions</th>
            </tr></thead>
            <tbody>
              {(d?.campaigns || []).map((c, i) => {
                const m = c.health?.metrics || {}
                const statusColor = { SCALE_READY: C.green, HEALTHY: C.blue, WATCH: C.yellow, KILL_SIGNAL: C.red, NO_DATA: C.muted }
                const isExpanded = expandedCamp === i
                const actionCount = (c.surgicalActions || []).length
                return [
                  <tr key={i} onClick={() => setExpandedCamp(isExpanded ? null : i)} style={{ cursor: 'pointer', background: isExpanded ? '#1C2333' : 'transparent' }}>
                    <td style={td}><span style={{ color: C.muted }}>{isExpanded ? '▼' : '▶'}</span></td>
                    <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                    <td style={td}>{fmt$(c.dailyBudget || c.budget)}</td>
                    <td style={td}>{fmt$(m.spend)}</td>
                    <td style={td}>{m.purchases || 0}</td>
                    <td style={{ ...td, color: m.cpa <= 38 ? C.green : m.cpa <= 47.25 ? C.yellow : C.red }}>{m.cpa > 0 ? fmt$(m.cpa) : '--'}</td>
                    <td style={{ ...td, color: m.frequency > 5 ? C.red : m.frequency > 3.5 ? C.yellow : C.text }}>{m.frequency?.toFixed(1) || '--'}</td>
                    <td style={td}>{c.health?.score || '--'}</td>
                    <td style={td}><span style={badge(statusColor[c.health?.status] || C.muted)}>{c.health?.status || '?'}</span></td>
                    <td style={td}>{actionCount > 0 ? <span style={badge(C.pink)}>{actionCount} actions</span> : <span style={{ color: C.muted, fontSize: 11 }}>Hold</span>}</td>
                  </tr>,
                  isExpanded && (c.surgicalActions || []).length > 0 && (
                    <tr key={`${i}-actions`} onClick={e => e.stopPropagation()}>
                      <td colSpan={10} style={{ padding: 0, background: '#1C2333' }}>
                        <div style={{ padding: '8px 16px 12px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Surgical Actions</div>
                          {(c.surgicalActions || []).map((sa, j) => (
                            <div key={j} style={{ ...card, borderLeft: `3px solid ${ACTION_COLORS[sa.action] || C.muted}`, marginBottom: 6, padding: '8px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                                    <span style={badge(PRIORITY_COLORS[sa.priority] || C.muted)}>{sa.priority}</span>
                                    <span style={badge(ACTION_COLORS[sa.action] || C.muted)}>{sa.action.replace(/_/g, ' ')}</span>
                                    <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{sa.entityName}</span>
                                  </div>
                                  <p style={{ color: C.muted, fontSize: 12, margin: '2px 0 0' }}>{sa.reason}</p>
                                  {sa.impact && <p style={{ color: C.green, fontSize: 12, margin: '2px 0 0' }}>{sa.impact}</p>}
                                  {sa.revenueProjection && (
                                    <div style={{ background: C.bg, borderRadius: 4, padding: '6px 8px', marginTop: 4, fontSize: 12 }}>
                                      <span style={{ color: C.muted }}>Current: {fmt$(sa.revenueProjection.currentBudget)}/day</span>
                                      <span style={{ color: C.text }}> → New: {fmt$(sa.revenueProjection.newBudget)}/day</span>
                                      <br/>
                                      <span style={{ color: C.green }}>Expected: +{fmt$(sa.revenueProjection.expectedRevenuePerDay)} revenue/day, +{fmt$(sa.revenueProjection.expectedProfitPerDay)} profit/day</span>
                                      <span style={{ color: C.muted }}> (based on {sa.revenueProjection.basedOnRoas}x ROAS)</span>
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'flex-start' }} onClick={e => e.stopPropagation()}>
                                  {sa.action === 'SCALE_BUDGET' && sa.execute && (
                                    <ScaleButton entityId={sa.execute.params.adSetId} entityName={sa.entityName} currentBudget={sa.revenueProjection?.currentBudget} roas={sa.revenueProjection?.basedOnRoas} onScale={executeScale} scaling={scaling} />
                                  )}
                                  {sa.action === 'PAUSE' && (
                                    <div style={{ textAlign: 'right' }}>
                                      <button onClick={() => executeAction2('updateAdSetStatus', { adSetId: sa.entityId, status: 'PAUSED' })} style={btnStyle(C.red)}>Pause Ad Set</button>
                                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Stops all spend immediately</div>
                                    </div>
                                  )}
                                  {sa.action === 'REDUCE_BUDGET' && (
                                    <div style={{ textAlign: 'right' }}>
                                      <button onClick={() => executeAction2('updateAdSetStatus', { adSetId: sa.entityId, status: 'PAUSED' })} style={btnStyle(C.red)}>Pause</button>
                                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Stops bleeding. Saves {sa.impact}</div>
                                    </div>
                                  )}
                                  {sa.action === 'REFRESH_AUDIENCE' && (
                                    <div style={{ textAlign: 'right' }}>
                                      <button onClick={() => executeAction2('updateAdSetStatus', { adSetId: sa.entityId, status: 'PAUSED' })} style={btnStyle(C.yellow)}>Pause + Replace</button>
                                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Pause saturated audience, create fresh one</div>
                                    </div>
                                  )}
                                  {sa.action === 'REPLACE_CREATIVE' && (
                                    <div style={{ textAlign: 'right' }}>
                                      <button onClick={() => executeAction2('updateAdStatus', { adId: sa.entityId, status: 'PAUSED' })} style={btnStyle(C.pink)}>Pause Creative</button>
                                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Creative is dead. Launch replacement.</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. Creative Table with Recommendations ─────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>Creative Performance</h2>
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={tbl}>
            <thead><tr>
              <th style={th}>Creative</th><th style={th}>Angle</th><th style={th}>ROAS</th>
              <th style={th}>CPA</th><th style={th}>Spend</th><th style={th}>Purchases</th>
              <th style={th}>Freq</th><th style={th}>Fatigue</th><th style={th}>Recommendation</th><th style={th}>Actions</th>
            </tr></thead>
            <tbody>
              {(d?.creatives || []).length === 0 && (
                <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: C.muted }}>No creative data. Click Sync Meta.</td></tr>
              )}
              {(d?.creatives || []).map((cr, i) => {
                const recColor = REC_COLORS[cr.recommendation] || C.muted
                const rowBg = cr.recommendation === 'SCALE' ? '#3FB95008' : cr.recommendation === 'KILL' ? '#F8514908' : 'transparent'
                return (
                  <tr key={i} style={{ background: rowBg }}>
                    <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cr.name}>{cr.name}</td>
                    <td style={td}><span style={badge(C.purple)}>{cr.creativeAngle}</span></td>
                    <td style={{ ...td, fontWeight: 600, color: cr.roas7d >= 2.22 ? C.green : cr.roas7d > 0 ? C.red : C.muted }}>{cr.roas7d > 0 ? fmtX(cr.roas7d) : '--'}</td>
                    <td style={{ ...td, color: cr.cpa7d > 0 && cr.cpa7d <= 38 ? C.green : cr.cpa7d > 47.25 ? C.red : C.text }}>{cr.cpa7d > 0 ? fmt$(cr.cpa7d) : '--'}</td>
                    <td style={td}>{fmt$(cr.spend)}</td>
                    <td style={td}>{cr.purchases}</td>
                    <td style={{ ...td, color: cr.frequency > 5 ? C.red : cr.frequency > 3.5 ? C.yellow : C.text }}>{cr.frequency}</td>
                    <td style={td}><FatigueBar score={cr.fatigueScore} status={cr.fatigueStatus} /></td>
                    <td style={td}>
                      <span style={recBadge(recColor)}>{cr.recommendation}</span>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2, maxWidth: 180 }}>{cr.recommendationReason}</div>
                      {cr.revenueProjection && (
                        <div style={{ fontSize: 10, color: C.green, marginTop: 2 }}>
                          +{fmt$(cr.revenueProjection.expectedRevenuePerDay)}/day rev, +{fmt$(cr.revenueProjection.expectedProfitPerDay)}/day profit
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {scaleTarget?.id === cr.adId ? (
                        <ScaleInline target={scaleTarget} onScale={executeScale} onCancel={() => setScaleTarget(null)} scaling={scaling} />
                      ) : (
                        <div style={{ display: 'flex', gap: 3 }}>
                          {cr.recommendation === 'SCALE' && <button onClick={() => setScaleTarget({ id: cr.adId, name: cr.name, budget: cr.spend / 7, roas: cr.roas7d })} style={btnStyle(C.green)}>Scale</button>}
                          {cr.recommendation === 'KILL' && <button style={btnStyle(C.red)}>Pause</button>}
                          <button onClick={() => analyseCreative(cr.name)} style={btnStyle(C.purple)}>AI</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 6. Growth Opportunities (always visible) ───────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>Growth Opportunities</h2>
        {(d?.opportunities || []).length === 0 ? (
          <div style={{ ...card, borderLeft: `3px solid ${C.green}` }}>
            <span style={{ color: C.green, fontWeight: 600 }}>All clear</span>
            <span style={{ color: C.muted, marginLeft: 8, fontSize: 12 }}>No gaps detected in current setup</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(d?.opportunities || []).map((o, i) => (
              <div key={i} style={{ ...card, borderLeft: `3px solid ${o.priority === 'high' ? C.pink : C.blue}` }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <span style={badge(o.priority === 'high' ? C.pink : C.blue)}>{o.priority}</span>
                  <span style={badge(C.purple)}>{o.type.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, color: C.text }}>{o.title}</div>
                <p style={{ color: C.muted, fontSize: 12, margin: 0, lineHeight: 1.4 }}>{o.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 7. Creative Analysis ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>Creative Analysis</h2>
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="text" value={analyseAdName} onChange={e => setAnalyseAdName(e.target.value)} placeholder="Paste ad name or describe the creative..."
              style={{ flex: 1, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 13 }} />
            <button onClick={() => analyseCreative(analyseAdName)} disabled={analysing || !analyseAdName} style={btnStyle(C.purple)}>
              {analysing ? 'Analysing...' : 'Analyse'}
            </button>
          </div>
          <p style={{ color: C.muted, fontSize: 11, margin: 0 }}>AI detects angle, recommends placement, writes copy, suggests campaign and ad set.</p>
          {analysis && !analysis.error && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                <div><div style={{ fontSize: 10, color: C.muted }}>Angle</div><span style={badge(C.purple)}>{analysis.detectedAngle}</span></div>
                <div><div style={{ fontSize: 10, color: C.muted }}>Format</div><span style={badge(C.blue)}>{analysis.detectedFormat}</span></div>
                <div><div style={{ fontSize: 10, color: C.muted }}>AOV Potential</div><span style={badge(analysis.aovPotential === 'premium' ? C.green : C.yellow)}>{analysis.aovPotential}</span></div>
                <div><div style={{ fontSize: 10, color: C.muted }}>Spend</div><span style={{ color: C.green, fontWeight: 600 }}>${analysis.recommendedDailySpend}/day</span></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div><div style={{ fontSize: 10, color: C.muted }}>Campaign</div><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{analysis.recommendedCampaign}</div></div>
                <div><div style={{ fontSize: 10, color: C.muted }}>Audience</div><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{analysis.recommendedAudience}</div></div>
              </div>
              {analysis.suggestedHookLine && <div style={{ background: C.bg, borderRadius: 6, padding: 8, marginBottom: 6 }}><div style={{ fontSize: 10, color: C.muted }}>Hook</div><div style={{ fontSize: 14, fontWeight: 600, color: C.pink }}>{analysis.suggestedHookLine}</div></div>}
              {analysis.suggestedBodyCopy && <div style={{ background: C.bg, borderRadius: 6, padding: 8, marginBottom: 6 }}><div style={{ fontSize: 10, color: C.muted }}>Body Copy</div><div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: C.text }}>{analysis.suggestedBodyCopy}</div></div>}
              <p style={{ color: C.muted, fontSize: 12, margin: '4px 0 0' }}>{analysis.placementReasoning}</p>
            </div>
          )}
          {analysis?.error && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>Error: {analysis.error}</div>}
        </div>
      </div>

      {/* ── 8. AOV Intelligence ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>AOV Intelligence</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div style={card}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: C.text }}>Daily AOV vs $160 Target</h3>
            {d?.aov?.dailyAvgAov?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={d.aov.dailyAvgAov}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} tickFormatter={dt => dt.slice(5)} />
                  <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 11 }} />
                  <ReferenceLine y={160} stroke={C.green} strokeDasharray="5 5" />
                  <Bar dataKey="avgAov" fill={C.blue} name="Avg AOV" radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <p style={{ color: C.muted, fontSize: 12 }}>Waiting for order data via Shopify webhook</p>}
          </div>
          <div style={card}>
            <div style={{ fontSize: 24, fontWeight: 700, color: (d?.aov?.bundleRate || 0) >= 30 ? C.green : C.yellow }}>{fmtPct(d?.aov?.bundleRate)}</div>
            <p style={{ color: C.muted, fontSize: 11 }}>bundle rate (target: 30%)</p>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginTop: 8 }}>{fmtPct(d?.aov?.singleItemRate)}</div>
            <p style={{ color: C.muted, fontSize: 11 }}>single item orders</p>
            {(d?.aov?.topCombos || []).length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>Top combos</div>
                {d.aov.topCombos.map((tc, i) => <div key={i} style={{ fontSize: 10, color: C.muted }}>{tc.combo}: {tc.count} ({tc.pctOfOrders}%)</div>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 9. Weekly Rhythm ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[{ day: 'monday', label: 'Monday', task: 'Review + Kill Rules', d: 1 }, { day: 'wednesday', label: 'Wednesday', task: 'Creative Launch', d: 3 }, { day: 'friday', label: 'Friday', task: 'Brief Generation', d: 5 }].map(r => {
          const done = d?.rhythm?.[`${r.day}Done`]
          const isToday = dayOfWeek === r.d
          return (
            <div key={r.day} style={{ ...card, borderTop: `3px solid ${done ? C.green : isToday ? C.blue : C.border}`, opacity: isToday || done ? 1 : 0.5 }}>
              <div style={{ fontSize: 11, color: C.muted }}>{r.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.task}</div>
              {done ? <span style={badge(C.green)}>Done</span> : isToday ? <button onClick={() => markDay(r.day)} style={btnSm}>Mark Done</button> : null}
            </div>
          )
        })}
      </div>

      {/* ── 10. Creative Brief ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>Creative Brief</h2>
        <div style={card}>
          {d?.brief ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: C.text }}>Week of {d.brief.weekOf}</span>
                {d.brief.status === 'draft' && <button onClick={() => approveBrief(d.brief.id)} style={btnStyle(C.green)}>Approve Brief</button>}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, color: C.text, maxHeight: 300, overflow: 'auto' }}>{d.brief.fullBrief}</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <p style={{ color: C.muted, marginBottom: 8 }}>No brief generated yet</p>
              <button onClick={triggerBrief} disabled={generating} style={btnStyle(C.pink)}>{generating ? 'Generating...' : 'Generate Brief'}</button>
            </div>
          )}
        </div>
      </div>

      {/* ── 11. System Health (compact footer) ─────────────────────────────── */}
      {d?.health && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: C.muted, marginTop: 8 }}>
          <span style={badge(d.health.status === 'healthy' ? C.green : C.yellow)}>{d.health.status}</span>
          <span>Backup: {d.health.backups?.latest || 'none'} ({d.health.backups?.totalDays || 0} days)</span>
          {d.health.issues?.length > 0 && <span style={{ color: C.yellow }}>{d.health.issues.length} issues</span>}
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function HeroCard({ label, value, sub, color }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || C.text, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function FatigueBar({ score, status }) {
  const color = score >= 75 ? C.green : score >= 50 ? C.yellow : score >= 25 ? C.orange : C.red
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 40, height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score || 0}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color }}>{score || 0}</span>
    </div>
  )
}

function ScaleButton({ entityId, entityName, currentBudget, roas, onScale, scaling }) {
  const [show, setShow] = useState(false)
  const [pct, setPct] = useState(15)
  if (!show) return <button onClick={e => { e.stopPropagation(); setShow(true) }} style={btnStyle(C.green)}>Scale</button>
  const extra = (currentBudget || 0) * (pct / 100)
  const expectedRev = extra * (roas || 3)
  const expectedProfit = (expectedRev * 0.45) - extra
  return (
    <div style={{ background: C.bg, borderRadius: 6, padding: 8, minWidth: 220 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
        <select value={pct} onChange={e => setPct(Number(e.target.value))} style={sel}>{[5, 8, 10, 12, 15, 18].map(p => <option key={p} value={p}>{p}%</option>)}</select>
        <button onClick={() => onScale(entityId, pct)} disabled={scaling} style={btnStyle(C.green)}>{scaling ? '...' : 'Execute'}</button>
        <button onClick={() => setShow(false)} style={{ ...btnSm, color: C.muted }}>X</button>
      </div>
      <div style={{ fontSize: 11, color: C.muted }}>Current: {fmt$(currentBudget)}/day → New: {fmt$((currentBudget || 0) * (1 + pct / 100))}/day</div>
      <div style={{ fontSize: 11, color: C.green }}>Expected: +{fmt$(expectedRev)} rev/day, +{fmt$(expectedProfit)} profit/day ({roas || 3}x ROAS)</div>
    </div>
  )
}

function ScaleInline({ target, onScale, onCancel, scaling }) {
  const [pct, setPct] = useState(15)
  const extra = (target.budget || 0) * (pct / 100)
  const expectedRev = extra * (target.roas || 3)
  const expectedProfit = (expectedRev * 0.45) - extra
  return (
    <div style={{ background: C.bg, borderRadius: 6, padding: 6, minWidth: 200 }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 3 }}>
        <select value={pct} onChange={e => setPct(Number(e.target.value))} style={sel}>{[5, 8, 10, 12, 15, 18].map(p => <option key={p} value={p}>{p}%</option>)}</select>
        <button onClick={() => onScale(target.id, pct)} disabled={scaling} style={btnStyle(C.green)}>{scaling ? '...' : 'Go'}</button>
        <button onClick={onCancel} style={{ ...btnSm, color: C.muted }}>X</button>
      </div>
      <div style={{ fontSize: 10, color: C.muted }}>{fmt$(target.budget)}/day → {fmt$((target.budget || 0) * (1 + pct / 100))}/day</div>
      <div style={{ fontSize: 10, color: C.green }}>+{fmt$(expectedRev)} rev, +{fmt$(expectedProfit)} profit ({(target.roas || 3).toFixed(1)}x)</div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', color: C.text }
const secTitle = { fontSize: 15, fontWeight: 600, margin: '0 0 8px', color: C.text }
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const th = { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', background: C.card }
const td = { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top', color: C.text }
const sel = { background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 4px', fontSize: 11 }

function btnStyle(color) {
  return { background: `${color}30`, color, border: `1px solid ${color}66`, borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
}
const btnSm = { background: `${C.blue}30`, color: C.blue, border: `1px solid ${C.blue}66`, borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }

function badge(color) {
  return { display: 'inline-block', background: `${color}38`, color, border: `1px solid ${color}66`, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }
}

function recBadge(color) {
  return { display: 'inline-block', background: `${color}40`, color, border: `2px solid ${color}88`, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.3px' }
}
