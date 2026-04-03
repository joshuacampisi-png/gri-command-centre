import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, Line, ComposedChart
} from 'recharts'

// ── Colours ─────────────────────────────────────────────────────────────────

const C = {
  bg: '#0D1117', card: '#161B22', border: '#30363D',
  text: '#E6EDF3', muted: '#7D8590',
  green: '#3FB950', red: '#F85149', yellow: '#D29922',
  blue: '#58A6FF', pink: '#E43F7B', purple: '#A371F7',
}

const API = '/api/flywheel'

function fmt$(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n) { return n != null ? n.toFixed(1) + '%' : '--' }

// ── Main Component ──────────────────────────────────────────────────────────

export function AdsFlywheelTab() {
  const [summary, setSummary] = useState(null)
  const [rhythm, setRhythm] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [aov, setAov] = useState(null)
  const [creatives, setCreatives] = useState([])
  const [brief, setBrief] = useState(null)
  const [conversions, setConversions] = useState([])
  const [actions, setActions] = useState([])
  const [log, setLog] = useState([])
  const [targets, setTargets] = useState({})
  const [learning, setLearning] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState('all')
  const [syncing, setSyncing] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [sumRes, alertRes, campRes, aovRes, crRes, brRes, convRes, actRes, logRes, tgtRes, learnRes] = await Promise.all([
        fetch(`${API}/summary`).then(r => r.json()),
        fetch(`${API}/alerts`).then(r => r.json()),
        fetch(`${API}/campaigns`).then(r => r.json()),
        fetch(`${API}/aov`).then(r => r.json()),
        fetch(`${API}/creatives`).then(r => r.json()),
        fetch(`${API}/brief/latest`).then(r => r.json()),
        fetch(`${API}/conversions?days=14`).then(r => r.json()),
        fetch(`${API}/actions`).then(r => r.json()),
        fetch(`${API}/log?days=14`).then(r => r.json()),
        fetch(`${API}/targets`).then(r => r.json()),
        fetch(`${API}/learning`).then(r => r.json()),
      ])
      if (sumRes.ok) { setSummary(sumRes.summary); setRhythm(sumRes.rhythm) }
      if (alertRes.ok) setAlerts(alertRes.alerts || [])
      if (campRes.ok) setCampaigns(campRes.campaigns || [])
      if (aovRes.ok) setAov(aovRes.current)
      if (crRes.ok) setCreatives(crRes.creatives || [])
      if (brRes.ok) setBrief(brRes.brief)
      if (convRes.ok) setConversions(convRes.conversions || [])
      if (actRes.ok) setActions(actRes.actions || [])
      if (logRes.ok) setLog(logRes.log || [])
      if (tgtRes.ok) setTargets(tgtRes.targets || {})
      if (learnRes.ok) setLearning(learnRes.learning || [])
      setError('')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load(); const i = setInterval(load, 60000); return () => clearInterval(i) }, [load])

  async function resolveAlert(id) {
    await fetch(`${API}/alerts/${id}/resolve`, { method: 'POST' })
    load()
  }

  async function approveAction(id) {
    await fetch(`${API}/actions/${id}/approve`, { method: 'POST' })
    load()
  }

  async function rejectAction(id) {
    await fetch(`${API}/actions/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Rejected by Josh' }) })
    load()
  }

  async function markDay(day) {
    await fetch(`${API}/rhythm/${day}/complete`, { method: 'POST' })
    load()
  }

  async function triggerSync() {
    setSyncing(true)
    await fetch(`${API}/meta-sync/trigger`, { method: 'POST' })
    setSyncing(false)
    load()
  }

  async function triggerBrief() {
    setGenerating(true)
    await fetch(`${API}/brief/generate`, { method: 'POST' })
    setGenerating(false)
    load()
  }

  async function approveBrief(id) {
    await fetch(`${API}/brief/${id}/approve`, { method: 'POST' })
    load()
  }

  async function runEngine() {
    await fetch(`${API}/decision-engine/run`, { method: 'POST' })
    load()
  }

  if (loading) return <div style={{ color: C.muted, padding: 40, textAlign: 'center' }}>Loading flywheel data...</div>
  if (error) return <div style={{ color: C.red, padding: 40 }}>Error: {error}</div>

  const today = new Date()
  const dayOfWeek = today.getDay()
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const todayName = dayNames[dayOfWeek]

  return (
    <div style={{ background: C.bg, color: C.text, padding: '24px 20px', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Ads Intelligence Flywheel</h1>
          <p style={{ color: C.muted, margin: '4px 0 0', fontSize: 13 }}>Every purchase makes the next brief smarter. Every dollar spent improves the next spend decision.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={triggerSync} disabled={syncing} style={btnStyle(C.blue)}>{syncing ? 'Syncing...' : 'Sync Meta'}</button>
          <button onClick={runEngine} style={btnStyle(C.purple)}>Run AI Engine</button>
        </div>
      </div>

      {/* Section 1: Daily Command */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <RhythmCard day="monday" label="Monday" task="Review + Kill Rules" subtitle="Check alerts, pause dead ads, review CPA" done={rhythm?.mondayDone} isToday={todayName === 'monday'} onMark={() => markDay('monday')} />
        <RhythmCard day="wednesday" label="Wednesday" task="Creative Launch" subtitle="Launch new creatives, duplicate winners" done={rhythm?.wednesdayDone} isToday={todayName === 'wednesday'} onMark={() => markDay('wednesday')} />
        <RhythmCard day="friday" label="Friday" task="Brief Generation" subtitle="Generate weekly brief, review data" done={rhythm?.fridayDone} isToday={todayName === 'friday'} onMark={() => markDay('friday')} />
      </div>

      {/* Section 2: AI Agent Actions */}
      {actions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={sectionTitle}>AI Recommendations ({actions.length})</h2>
          {actions.map(a => (
            <div key={a.id} style={{ ...cardStyle, borderLeft: `3px solid ${a.riskLevel === 'high' ? C.red : a.riskLevel === 'medium' ? C.yellow : C.green}`, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{a.actionTitle}</span>
                    <span style={badgeStyle(a.aiConfidence >= 7 ? C.green : a.aiConfidence >= 5 ? C.yellow : C.red)}>
                      Confidence: {a.aiConfidence}/10
                    </span>
                    <span style={badgeStyle(a.riskLevel === 'high' ? C.red : a.riskLevel === 'medium' ? C.yellow : C.green)}>
                      {a.riskLevel} risk
                    </span>
                  </div>
                  <p style={{ color: C.muted, fontSize: 13, margin: '4px 0' }}>{a.actionSummary}</p>
                  <details style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer' }}>Full reasoning</summary>
                    <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{a.aiReasoning}</p>
                    <p style={{ marginTop: 4 }}><strong>Expected outcome:</strong> {a.expectedOutcome}</p>
                  </details>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => approveAction(a.id)} style={btnStyle(C.green)}>Approve</button>
                  <button onClick={() => rejectAction(a.id)} style={btnStyle(C.red)}>Reject</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section 3: Live Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={sectionTitle}>Live Alerts ({alerts.length})</h2>
          {alerts.slice(0, 10).map(a => (
            <div key={a.id} style={{
              ...cardStyle,
              borderLeft: `3px solid ${a.severity === 'critical' ? C.red : a.severity === 'warning' ? C.yellow : C.blue}`,
              marginBottom: 6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={badgeStyle(a.severity === 'critical' ? C.red : a.severity === 'warning' ? C.yellow : C.blue)}>
                      {a.severity === 'critical' ? 'Kill recommended' : a.severity === 'warning' ? 'Review required' : 'Opportunity'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</span>
                  </div>
                  <p style={{ color: C.muted, fontSize: 12, margin: '4px 0 0' }}>{a.body}</p>
                </div>
                <button onClick={() => resolveAlert(a.id)} style={btnSmall}>Resolve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section 4: Flywheel Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Today's Spend" value={fmt$(summary?.todaySpend)} sub={`${summary?.spendDelta > 0 ? '+' : ''}${summary?.spendDelta || 0}% vs yesterday`} color={C.text} />
        <MetricCard label="7 Day ROAS" value={summary?.weekRoas?.toFixed(2) || '--'} sub="Target: 3.33" color={summary?.weekRoas >= 3.33 ? C.green : C.red} />
        <MetricCard label="7 Day CPA" value={fmt$(summary?.weekCpa)} sub={`Target: ${fmt$(summary?.cpaTarget)}`} color={summary?.weekCpa <= (summary?.cpaTarget || 28) ? C.green : C.red} />
        <MetricCard label="7 Day AOV" value={fmt$(summary?.avgAov7d)} sub={`${summary?.aovVsTarget > 0 ? '+' : ''}${fmt$(summary?.aovVsTarget)} vs $160 target`} color={summary?.avgAov7d >= 160 ? C.green : C.yellow} />
      </div>

      {/* Extra metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Week Spend" value={fmt$(summary?.weekSpend)} sub={`${summary?.weekPurchases || 0} purchases`} color={C.text} />
        <MetricCard label="Week Revenue" value={fmt$(summary?.weekRevenue)} sub="From Meta attributed" color={C.text} />
        <MetricCard label="Bundle Rate" value={fmtPct(summary?.bundleRate7d)} sub="Target: 30%+" color={summary?.bundleRate7d >= 30 ? C.green : C.yellow} />
        <MetricCard label="Orders Today" value={summary?.ordersToday || 0} sub="From Shopify webhook" color={C.text} />
      </div>

      {/* Section 5: Campaign Health Table */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={sectionTitle}>Campaign Health</h2>
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Campaign</th>
                <th style={thStyle}>Budget/day</th>
                <th style={thStyle}>7d ROAS</th>
                <th style={thStyle}>7d CPA</th>
                <th style={thStyle}>Frequency</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: C.muted }}>No campaign data yet. Click "Sync Meta" to pull data.</td></tr>
              )}
              {campaigns.map((c, i) => {
                const h = c.health || {}
                const m = h.metrics || {}
                const statusColors = {
                  SCALE_READY: C.blue, HEALTHY: C.green, WATCH: C.yellow, KILL_SIGNAL: C.red, NO_DATA: C.muted,
                }
                return (
                  <tr key={i}>
                    <td style={tdStyle}>{c.name}</td>
                    <td style={tdStyle}>{fmt$(c.dailyBudget || c.budget)}</td>
                    <td style={{ ...tdStyle, color: m.roas >= 3.33 ? C.green : C.red }}>{m.roas?.toFixed(2) || '--'}</td>
                    <td style={{ ...tdStyle, color: m.cpa <= 28 ? C.green : C.red }}>{m.cpa > 0 ? fmt$(m.cpa) : '--'}</td>
                    <td style={{ ...tdStyle, color: m.frequency > 5 ? C.red : m.frequency > 3.5 ? C.yellow : C.text }}>{m.frequency?.toFixed(1) || '--'}</td>
                    <td style={tdStyle}>{h.score || '--'}</td>
                    <td style={tdStyle}>
                      <span style={badgeStyle(statusColors[h.status] || C.muted)}>{h.status || 'Unknown'}</span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>
                      {h.status === 'SCALE_READY' && 'Increase budget 15%'}
                      {h.status === 'KILL_SIGNAL' && 'Pause or rotate creative'}
                      {h.status === 'WATCH' && 'Monitor closely'}
                      {h.status === 'HEALTHY' && 'Hold steady'}
                      {h.status === 'NO_DATA' && 'Sync data'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 6: AOV Intelligence */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={sectionTitle}>AOV Intelligence</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: C.text }}>Daily AOV vs $160 Target</h3>
            {aov?.dailyAvgAov?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={aov.dailyAvgAov}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} domain={[0, 'auto']} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 12 }} />
                  <ReferenceLine y={160} stroke={C.green} strokeDasharray="5 5" label={{ value: '$160 target', fill: C.green, fontSize: 11 }} />
                  <Bar dataKey="avgAov" fill={C.blue} name="Avg AOV" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="orders" stroke={C.pink} name="Orders" yAxisId={0} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: C.muted, fontSize: 13 }}>No AOV data yet. Orders will appear here once Shopify webhook data flows in.</p>
            )}
          </div>
          <div style={cardStyle}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: C.text }}>Bundle Gap</h3>
            <div style={{ fontSize: 28, fontWeight: 700, color: aov?.bundleRate >= 30 ? C.green : C.yellow }}>
              {fmtPct(aov?.bundleRate)}
            </div>
            <p style={{ color: C.muted, fontSize: 12, margin: '4px 0 8px' }}>of orders are bundles (target: 30%+)</p>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.text }}>
              {fmtPct(aov?.singleItemRate)}
            </div>
            <p style={{ color: C.muted, fontSize: 12, margin: '4px 0 8px' }}>of orders are single item</p>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Top combinations</p>
              {(aov?.topCombos || []).map((tc, i) => (
                <div key={i} style={{ fontSize: 11, color: C.muted, padding: '2px 0' }}>
                  {tc.combo}: {tc.count} orders ({tc.pctOfOrders}%)
                </div>
              ))}
              {(!aov?.topCombos || aov.topCombos.length === 0) && (
                <p style={{ fontSize: 11, color: C.muted }}>No bundle data yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 7: Creative Performance Leaderboard */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={sectionTitle}>Creative Performance Leaderboard</h2>
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Creative</th>
                <th style={thStyle}>Angle</th>
                <th style={thStyle}>Format</th>
                <th style={thStyle}>Thumbstop</th>
                <th style={thStyle}>Sustain</th>
                <th style={thStyle}>7d ROAS</th>
                <th style={thStyle}>7d CPA</th>
                <th style={thStyle}>Avg AOV</th>
                <th style={thStyle}>Freq</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {creatives.length === 0 && (
                <tr><td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: C.muted }}>No creative data yet. Sync Meta to populate.</td></tr>
              )}
              {creatives.map((cr, i) => {
                const rowBg = i < 3 ? '#3FB95010' : cr.frequency > 5 ? '#F8514910' : 'transparent'
                return (
                  <tr key={i} style={{ background: rowBg }}>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cr.name}</td>
                    <td style={tdStyle}><span style={badgeStyle(C.purple)}>{cr.creativeAngle}</span></td>
                    <td style={tdStyle}>{cr.formatType}</td>
                    <td style={{ ...tdStyle, color: cr.thumbstopPct >= 25 ? C.green : C.yellow }}>{cr.thumbstopPct}%</td>
                    <td style={tdStyle}>{cr.sustainPct}%</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: cr.roas7d >= 3.33 ? C.green : C.red }}>{cr.roas7d}</td>
                    <td style={{ ...tdStyle, color: cr.cpa7d <= 28 ? C.green : C.red }}>{fmt$(cr.cpa7d)}</td>
                    <td style={{ ...tdStyle, color: cr.avgAov >= 160 ? C.green : cr.avgAov >= 100 ? C.yellow : C.text }}>{cr.avgAov > 0 ? fmt$(cr.avgAov) : '--'}</td>
                    <td style={{ ...tdStyle, color: cr.frequency > 5 ? C.red : cr.frequency > 3.5 ? C.yellow : C.text }}>{cr.frequency}</td>
                    <td style={tdStyle}><span style={badgeStyle(cr.status === 'winner' ? C.green : cr.status === 'fatigued' ? C.red : cr.status === 'watch' ? C.yellow : C.muted)}>{cr.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {creatives.length > 3 && (
            <p style={{ color: C.muted, fontSize: 11, padding: '8px 12px', borderTop: `1px solid ${C.border}` }}>
              Top 3 highlighted green. Red rows indicate frequency above 5 (fatigued). 10% of creatives generate 90% of spend. Meta has identified its winners.
            </p>
          )}
        </div>
      </div>

      {/* Section 8: Creative Brief */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={sectionTitle}>Creative Brief</h2>
        <div style={cardStyle}>
          {brief ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>Week of {brief.weekOf}</span>
                  <span style={{ ...badgeStyle(brief.status === 'approved' ? C.green : C.yellow), marginLeft: 8 }}>{brief.status}</span>
                </div>
                {brief.status === 'draft' && (
                  <button onClick={() => approveBrief(brief.id)} style={btnStyle(C.green)}>Approve Brief</button>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: C.text, maxHeight: 400, overflow: 'auto' }}>
                {brief.fullBrief}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <p style={{ color: C.muted, marginBottom: 12 }}>No creative brief generated yet.</p>
              <button onClick={triggerBrief} disabled={generating} style={btnStyle(C.pink)}>
                {generating ? 'Generating...' : 'Generate This Week\'s Brief'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section 9: CPA Targets */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={sectionTitle}>CPA Targets</h2>
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Target CPA</th>
                <th style={thStyle}>Kill CPA (2.5x)</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(targets).map(([cat, t]) => (
                <tr key={cat}>
                  <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{cat.replace(/_/g, ' ')}</td>
                  <td style={tdStyle}>{fmt$(t.target)}</td>
                  <td style={{ ...tdStyle, color: C.red }}>{fmt$(t.max)}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(C.green)}>Active</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: C.muted, fontSize: 11, padding: '8px 12px', borderTop: `1px solid ${C.border}` }}>
            Kill rule fires when an ad exceeds the max CPA for 3 consecutive days. Scale rule fires when below target for 5 consecutive days.
          </p>
        </div>
      </div>

      {/* Section 10: Flywheel Log */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={sectionTitle}>Flywheel Log (last 14 days)</h2>
        <div style={cardStyle}>
          {conversions.length > 0 ? (
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Order</th>
                    <th style={thStyle}>AOV</th>
                    <th style={thStyle}>Products</th>
                    <th style={thStyle}>Source</th>
                    <th style={thStyle}>Angle</th>
                    <th style={thStyle}>Bundle</th>
                  </tr>
                </thead>
                <tbody>
                  {conversions.slice(0, 50).map((c, i) => (
                    <tr key={i}>
                      <td style={{ ...tdStyle, fontSize: 11 }}>{new Date(c.orderedAt).toLocaleDateString('en-AU')}</td>
                      <td style={tdStyle}>{c.orderName || c.shopifyOrderId}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: c.aov >= 160 ? C.green : c.aov >= 100 ? C.yellow : C.text }}>{fmt$(c.aov)}</td>
                      <td style={{ ...tdStyle, fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(c.products || []).map(p => p.title).join(', ')}
                      </td>
                      <td style={tdStyle}><span style={badgeStyle(c.utmSource === 'facebook' ? C.blue : C.muted)}>{c.utmSource || 'direct'}</span></td>
                      <td style={tdStyle}>{c.creativeAngle || '--'}</td>
                      <td style={tdStyle}>{c.bundleDetected ? <span style={badgeStyle(C.green)}>Bundle</span> : <span style={{ color: C.muted }}>Single</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: 13, padding: 12 }}>No conversion data yet. Register the Shopify webhook to start tracking orders.</p>
          )}
        </div>
      </div>

      {/* Section 11: Agent Learning */}
      {learning.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={sectionTitle}>Agent Learning History</h2>
          <div style={cardStyle}>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {learning.slice(0, 20).map((l, i) => (
                <div key={i} style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{l.actionType}</span>
                    <span style={{ color: C.muted }}>{l.predictionAccuracy ? `${l.predictionAccuracy}% accurate` : 'Pending'}</span>
                  </div>
                  <p style={{ color: C.muted, margin: '2px 0' }}>
                    Confidence was {l.confidenceWas}, should be {l.confidenceShouldBe || '?'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section 12: System Event Log */}
      <details style={{ marginBottom: 20 }}>
        <summary style={{ ...sectionTitle, cursor: 'pointer' }}>System Event Log ({log.length} events)</summary>
        <div style={{ ...cardStyle, marginTop: 8, maxHeight: 300, overflow: 'auto' }}>
          {log.slice(0, 50).map((e, i) => (
            <div key={i} style={{ padding: '6px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
              <span style={{ color: C.muted, marginRight: 8 }}>{new Date(e.timestamp).toLocaleString('en-AU')}</span>
              <span style={badgeStyle(C.blue)}>{e.type}</span>
              <span style={{ marginLeft: 8 }}>{typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}</span>
            </div>
          ))}
          {log.length === 0 && <p style={{ color: C.muted, padding: 12, fontSize: 12 }}>No events yet</p>}
        </div>
      </details>

    </div>
  )
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function RhythmCard({ day, label, task, subtitle, done, isToday, onMark }) {
  const borderColor = done ? C.green : isToday ? C.blue : C.border
  return (
    <div style={{ ...cardStyle, borderTop: `3px solid ${borderColor}`, opacity: isToday || done ? 1 : 0.6 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{task}</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{subtitle}</div>
      {done ? (
        <span style={badgeStyle(C.green)}>Done</span>
      ) : isToday ? (
        <button onClick={onMark} style={btnSmall}>Mark Done</button>
      ) : (
        <span style={{ fontSize: 11, color: C.muted }}>{new Date().getDay() > ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(day) ? 'Completed' : 'Upcoming'}</span>
      )}
    </div>
  )
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || C.text }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const cardStyle = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '14px 16px',
}

const sectionTitle = {
  fontSize: 16,
  fontWeight: 600,
  margin: '0 0 10px',
  color: C.text,
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: `1px solid ${C.border}`,
  color: C.muted,
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const tdStyle = {
  padding: '8px 10px',
  borderBottom: `1px solid ${C.border}`,
  verticalAlign: 'middle',
}

function btnStyle(color) {
  return {
    background: `${color}20`,
    color,
    border: `1px solid ${color}44`,
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  }
}

const btnSmall = {
  background: `${C.blue}20`,
  color: C.blue,
  border: `1px solid ${C.blue}44`,
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  cursor: 'pointer',
}

function badgeStyle(color) {
  return {
    display: 'inline-block',
    background: `${color}20`,
    color,
    border: `1px solid ${color}44`,
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 600,
  }
}
