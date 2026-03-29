import { useState, useEffect, useCallback, useMemo } from 'react'
import { LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

// ── Constants ────────────────────────────────────────────────────────────────

const API = '/api/ads'
const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '14d', label: 'Last 14 Days' },
  { key: '30d', label: 'Last 30 Days' },
]

const FATIGUE_COLORS = {
  HEALTHY: '#3fb950',
  WATCH: '#d29922',
  FATIGUING: '#e3651d',
  DEAD: '#f85149',
}

const KPI_THRESHOLDS = {
  roas: { green: 3.0, amber: 2.0 },
  cpa: { green: 25, amber: 45 },
  ctr: { green: 2, amber: 1 },
  cpm: { green: 12, amber: 20 },
}

function kpiColor(metric, value) {
  const t = KPI_THRESHOLDS[metric]
  if (!t) return '#7C8DB0'
  if (metric === 'cpa' || metric === 'cpm') {
    if (value <= t.green) return '#3fb950'
    if (value <= t.amber) return '#d29922'
    return '#f85149'
  }
  if (value >= t.green) return '#3fb950'
  if (value >= t.amber) return '#d29922'
  return '#f85149'
}

function deltaArrow(today, yesterday, invert = false) {
  if (yesterday == null || yesterday === 0) return null
  const diff = today - yesterday
  const pct = ((diff / Math.abs(yesterday)) * 100).toFixed(1)
  const isGood = invert ? diff < 0 : diff > 0
  return { pct: `${diff > 0 ? '+' : ''}${pct}%`, isGood }
}

function fmtNum(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return Number(n).toFixed(decimals)
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, prefix, suffix, metric, delta }) {
  const color = kpiColor(metric, value)
  return (
    <div className="ads-kpi-card">
      <div className="ads-kpi-label">{label}</div>
      <div className="ads-kpi-value" style={{ color }}>
        {prefix}{fmtNum(value)}{suffix}
      </div>
      {delta && (
        <div className={`ads-kpi-delta ${delta.isGood ? 'ads-delta-good' : 'ads-delta-bad'}`}>
          {delta.isGood ? '▲' : '▼'} {delta.pct} vs yesterday
        </div>
      )}
    </div>
  )
}

// ── Fatigue Badge ────────────────────────────────────────────────────────────

function FatigueBadge({ status, score }) {
  const color = FATIGUE_COLORS[status] || '#7C8DB0'
  return (
    <span className="ads-fatigue-badge" style={{ background: color + '18', color, borderColor: color + '44' }}>
      {status} ({score})
    </span>
  )
}

// ── Campaign Table ───────────────────────────────────────────────────────────

function CampaignRow({ campaign, onExpand, expanded, onPause }) {
  const ins = campaign.insights
  return (
    <>
      <tr className={`ads-campaign-row ${expanded ? 'ads-row-expanded' : ''}`} onClick={() => onExpand(campaign.id)}>
        <td className="ads-name-cell">
          <span className="ads-expand-icon">{expanded ? '▼' : '▶'}</span>
          {campaign.name}
        </td>
        <td>
          <span className={`ads-status-badge ads-status-${campaign.status?.toLowerCase()}`}>
            {campaign.status}
          </span>
        </td>
        <td>${campaign.dailyBudget ? fmtNum(campaign.dailyBudget) : '—'}</td>
        <td>${fmtNum(ins?.spend)}</td>
        <td style={{ color: kpiColor('roas', ins?.roas) }}>{fmtNum(ins?.roas)}</td>
        <td style={{ color: kpiColor('cpa', ins?.cpa) }}>${fmtNum(ins?.cpa)}</td>
        <td style={{ color: kpiColor('ctr', ins?.ctr) }}>{fmtNum(ins?.ctr)}%</td>
        <td style={{ color: kpiColor('cpm', ins?.cpm) }}>${fmtNum(ins?.cpm)}</td>
        <td>{fmtNum(ins?.frequency, 1)}</td>
        <td>
          <span className="ads-health-score" style={{ color: campaign.healthScore >= 70 ? '#3fb950' : campaign.healthScore >= 40 ? '#d29922' : '#f85149' }}>
            {campaign.healthScore ?? '—'}
          </span>
        </td>
        <td onClick={e => e.stopPropagation()}>
          {campaign.status === 'ACTIVE' && (
            <button className="ads-btn-sm ads-btn-pause" onClick={() => onPause(campaign.id)} title="Pause Campaign">⏸</button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="ads-ad-expand-row">
          <td colSpan={11} style={{ padding: 0 }}>
            <AdTable ads={campaign.ads || []} campaignName={campaign.name} />
          </td>
        </tr>
      )}
    </>
  )
}

// ── Ad Table (inline expand) ─────────────────────────────────────────────────

function AdTable({ ads, campaignName }) {
  const [recAdId, setRecAdId] = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pausingId, setPausingId] = useState(null)

  const fetchRecommendation = async (ad) => {
    if (recAdId === ad.id && recommendation) {
      setRecAdId(null)
      return
    }
    setRecAdId(ad.id)
    setLoading(true)
    try {
      const res = await fetch(`${API}/refresh-recommendation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adName: ad.name,
          campaignName,
          metrics: {
            frequency: ad.insights?.frequency,
            ctr: ad.insights?.ctr,
            roas: ad.insights?.roas,
            cpa: ad.insights?.cpa,
            daysRunning: ad.daysRunning,
            fatigueScore: ad.fatigue?.score
          }
        })
      })
      const data = await res.json()
      setRecommendation(data.recommendation)
    } catch {
      setRecommendation({ diagnosis: 'Failed to load recommendation' })
    }
    setLoading(false)
  }

  const handlePause = async (adId) => {
    setPausingId(adId)
    try {
      await fetch(`${API}/pause/${adId}`, { method: 'POST' })
    } catch {}
    setPausingId(null)
  }

  if (!ads.length) return <div className="ads-empty">No ads in this campaign</div>

  return (
    <div className="ads-ad-table-wrap">
      <table className="ads-table ads-ad-table">
        <thead>
          <tr>
            <th>Ad Name</th>
            <th>Thumb</th>
            <th>Impr</th>
            <th>Clicks</th>
            <th>CTR</th>
            <th>ROAS</th>
            <th>CPA</th>
            <th>Freq</th>
            <th>Days</th>
            <th>Health</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {ads.map(ad => (
            <>
              <tr key={ad.id} className="ads-ad-row">
                <td className="ads-name-cell">{ad.name}</td>
                <td>
                  {ad.thumbnailUrl
                    ? <img src={ad.thumbnailUrl} alt="" className="ads-thumb" />
                    : <span className="muted">—</span>
                  }
                </td>
                <td>{fmtNum(ad.insights?.impressions, 0)}</td>
                <td>{fmtNum(ad.insights?.clicks, 0)}</td>
                <td style={{ color: kpiColor('ctr', ad.insights?.ctr) }}>{fmtNum(ad.insights?.ctr)}%</td>
                <td style={{ color: kpiColor('roas', ad.insights?.roas) }}>{fmtNum(ad.insights?.roas)}</td>
                <td style={{ color: kpiColor('cpa', ad.insights?.cpa) }}>${fmtNum(ad.insights?.cpa)}</td>
                <td>{fmtNum(ad.insights?.frequency, 1)}</td>
                <td>{ad.daysRunning}d</td>
                <td><FatigueBadge status={ad.fatigue?.status} score={ad.fatigue?.score} /></td>
                <td>
                  <div className="ads-actions">
                    {ad.status === 'ACTIVE' && (
                      <button
                        className="ads-btn-sm ads-btn-pause"
                        onClick={() => handlePause(ad.id)}
                        disabled={pausingId === ad.id}
                        title="Pause Ad"
                      >
                        {pausingId === ad.id ? '...' : '⏸'}
                      </button>
                    )}
                    {(ad.fatigue?.score ?? 100) < 50 && (
                      <button
                        className="ads-btn-sm ads-btn-ai"
                        onClick={() => fetchRecommendation(ad)}
                        title="AI Refresh Brief"
                      >
                        🤖
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              {recAdId === ad.id && (
                <tr key={`rec-${ad.id}`} className="ads-rec-row">
                  <td colSpan={11}>
                    <RecommendationPanel rec={recommendation} loading={loading} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── AI Recommendation Panel ──────────────────────────────────────────────────

function RecommendationPanel({ rec, loading }) {
  if (loading) return <div className="ads-rec-panel"><div className="ads-loading">Generating AI brief...</div></div>
  if (!rec) return null

  const copyBrief = () => {
    const text = `CREATIVE BRIEF\n\nDiagnosis: ${rec.diagnosis}\nHook: ${rec.creativeBrief?.hook}\nVisual: ${rec.creativeBrief?.visual}\nCopy Angle: ${rec.creativeBrief?.copyAngle}\nFormat: ${rec.creativeBrief?.format}\nBiggest Lever: ${rec.biggestLever}\nTest Budget: ${rec.testBudget}`
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="ads-rec-panel">
      <div className="ads-rec-header">
        <span>🤖 AI Refresh Recommendation</span>
        <button className="ads-btn-sm" onClick={copyBrief}>📋 Copy Brief</button>
      </div>
      <div className="ads-rec-grid">
        <div className="ads-rec-item">
          <strong>Diagnosis</strong>
          <p>{rec.diagnosis}</p>
        </div>
        {rec.creativeBrief && (
          <div className="ads-rec-item">
            <strong>Creative Brief</strong>
            <p><b>Hook:</b> {rec.creativeBrief.hook}</p>
            <p><b>Visual:</b> {rec.creativeBrief.visual}</p>
            <p><b>Copy:</b> {rec.creativeBrief.copyAngle}</p>
            <p><b>Format:</b> {rec.creativeBrief.format}</p>
          </div>
        )}
        <div className="ads-rec-item">
          <strong>Biggest Lever</strong>
          <p>{rec.biggestLever}</p>
        </div>
        <div className="ads-rec-item">
          <strong>Test Budget</strong>
          <p>{rec.testBudget}</p>
        </div>
      </div>
    </div>
  )
}

// ── Performance Charts ───────────────────────────────────────────────────────

function PerformanceCharts({ campaigns }) {
  // 1. ROAS trend by campaign (from daily insights)
  const roasData = useMemo(() => {
    const dayMap = {}
    for (const c of campaigns) {
      for (const ad of c.ads || []) {
        for (const d of ad.dailyInsights || []) {
          if (!d?.date) continue
          if (!dayMap[d.date]) dayMap[d.date] = {}
          if (!dayMap[d.date][c.name]) dayMap[d.date][c.name] = { spend: 0, purchaseValue: 0 }
          dayMap[d.date][c.name].spend += d.spend || 0
          dayMap[d.date][c.name].purchaseValue += d.purchaseValue || 0
        }
      }
    }
    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, camps]) => {
        const row = { date: date.slice(5) }
        for (const [name, vals] of Object.entries(camps)) {
          row[name] = vals.spend > 0 ? Number((vals.purchaseValue / vals.spend).toFixed(2)) : 0
        }
        return row
      })
  }, [campaigns])

  const campaignNames = [...new Set(campaigns.map(c => c.name))]
  const chartColors = ['#E43F7B', '#3B82F6', '#3fb950', '#d29922', '#a855f7']

  // 2. Spend vs ROAS scatter
  const scatterData = useMemo(() => {
    const points = []
    for (const c of campaigns) {
      for (const ad of c.ads || []) {
        if (!ad.insights) continue
        points.push({
          x: ad.insights.spend,
          y: ad.insights.roas,
          name: ad.name,
          status: ad.fatigue?.status || 'HEALTHY',
          fill: FATIGUE_COLORS[ad.fatigue?.status] || '#3fb950'
        })
      }
    }
    return points
  }, [campaigns])

  // 3. Frequency vs CTR
  const freqCtrData = useMemo(() => {
    const points = []
    for (const c of campaigns) {
      for (const ad of c.ads || []) {
        if (!ad.insights || !ad.insights.frequency) continue
        points.push({
          frequency: Number(ad.insights.frequency.toFixed(1)),
          ctr: Number(ad.insights.ctr.toFixed(2)),
          name: ad.name
        })
      }
    }
    return points.sort((a, b) => a.frequency - b.frequency)
  }, [campaigns])

  if (!campaigns.length) return null

  return (
    <div className="ads-charts">
      <h3 className="ads-section-title">Performance Charts</h3>
      <div className="ads-charts-grid">
        {/* ROAS Trend */}
        <div className="ads-chart-card">
          <h4>7-Day ROAS Trend</h4>
          {roasData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={roasData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF4" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {campaignNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={chartColors[i % chartColors.length]} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="ads-empty">No trend data available</div>}
        </div>

        {/* Spend vs ROAS */}
        <div className="ads-chart-card">
          <h4>Spend vs ROAS</h4>
          {scatterData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF4" />
                <XAxis dataKey="x" name="Spend" tick={{ fontSize: 11 }} label={{ value: 'Spend ($)', position: 'bottom', fontSize: 11 }} />
                <YAxis dataKey="y" name="ROAS" tick={{ fontSize: 11 }} label={{ value: 'ROAS', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="ads-chart-tooltip">
                      <strong>{d.name}</strong>
                      <div>Spend: ${d.x?.toFixed(2)}</div>
                      <div>ROAS: {d.y?.toFixed(2)}</div>
                      <div style={{ color: FATIGUE_COLORS[d.status] }}>{d.status}</div>
                    </div>
                  )
                }} />
                <Scatter data={scatterData} fill="#E43F7B">
                  {scatterData.map((entry, i) => (
                    <circle key={i} cx={0} cy={0} r={5} fill={entry.fill} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : <div className="ads-empty">No data available</div>}
        </div>

        {/* Frequency vs CTR */}
        <div className="ads-chart-card">
          <h4>Frequency vs CTR (Fatigue Curve)</h4>
          {freqCtrData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF4" />
                <XAxis dataKey="frequency" name="Frequency" tick={{ fontSize: 11 }} label={{ value: 'Frequency', position: 'bottom', fontSize: 11 }} />
                <YAxis dataKey="ctr" name="CTR %" tick={{ fontSize: 11 }} label={{ value: 'CTR %', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="ads-chart-tooltip">
                      <strong>{d.name}</strong>
                      <div>Frequency: {d.frequency}</div>
                      <div>CTR: {d.ctr}%</div>
                    </div>
                  )
                }} />
                <Scatter data={freqCtrData} fill="#3B82F6" />
              </ScatterChart>
            </ResponsiveContainer>
          ) : <div className="ads-empty">No data available</div>}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function AdsPerformanceTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dateRange, setDateRange] = useState('7d')
  const [expandedCampaign, setExpandedCampaign] = useState(null)
  const [sendingReport, setSendingReport] = useState(false)
  const [lastSynced, setLastSynced] = useState(null)

  const fetchData = useCallback(async (range) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/performance?dateRange=${range || dateRange}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed to load')
      setData(json)
      setLastSynced(json.lastSynced)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [dateRange])

  useEffect(() => { fetchData() }, [dateRange])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const iv = setInterval(() => fetchData(), 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [fetchData])

  const handleSendReport = async () => {
    setSendingReport(true)
    try {
      await fetch(`${API}/report/send`, { method: 'POST' })
    } catch {}
    setSendingReport(false)
  }

  const handlePauseCampaign = async (id) => {
    try {
      await fetch(`${API}/pause/${id}`, { method: 'POST' })
      fetchData()
    } catch {}
  }

  const kpi = data?.kpi?.today
  const yKpi = data?.kpi?.yesterday
  const campaigns = data?.campaigns || []

  // Ad health summary
  const allAds = campaigns.flatMap(c => (c.ads || []).filter(a => a.status === 'ACTIVE'))
  const healthCounts = {
    HEALTHY: allAds.filter(a => a.fatigue?.status === 'HEALTHY').length,
    WATCH: allAds.filter(a => a.fatigue?.status === 'WATCH').length,
    FATIGUING: allAds.filter(a => a.fatigue?.status === 'FATIGUING').length,
    DEAD: allAds.filter(a => a.fatigue?.status === 'DEAD').length,
  }

  return (
    <div className="page ads-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Ads Performance</h2>
          <p className="page-sub">Gender Reveal Ideas — Meta Ads</p>
        </div>
        <div className="page-actions">
          {lastSynced && <span className="muted" style={{ fontSize: 11, marginRight: 8 }}>Last synced: {new Date(lastSynced).toLocaleTimeString('en-AU')}</span>}
          <button className="btn-sec" onClick={() => fetchData()} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh Data'}
          </button>
          <button className="btn-sec" onClick={handleSendReport} disabled={sendingReport}>
            {sendingReport ? 'Sending...' : '📨 Send Report'}
          </button>
        </div>
      </div>

      {/* Date Range */}
      <div className="ads-date-pills">
        {DATE_RANGES.map(r => (
          <button
            key={r.key}
            className={`ads-pill ${dateRange === r.key ? 'ads-pill-active' : ''}`}
            onClick={() => setDateRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Error State */}
      {error && (
        <div className="ads-error">
          <span>⚠️ {error}</span>
          <button className="btn-sec" onClick={() => fetchData()}>Retry</button>
        </div>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="ads-loading-wrap">
          <div className="ads-skeleton" /><div className="ads-skeleton" />
          <div className="ads-skeleton" /><div className="ads-skeleton" />
        </div>
      )}

      {/* KPI Cards */}
      {kpi && (
        <div className="ads-kpi-grid">
          <KpiCard
            label="ROAS"
            value={kpi.roas}
            metric="roas"
            delta={deltaArrow(kpi.roas, yKpi?.roas)}
          />
          <KpiCard
            label="CPA"
            value={kpi.cpa}
            prefix="$"
            suffix=" AUD"
            metric="cpa"
            delta={deltaArrow(kpi.cpa, yKpi?.cpa, true)}
          />
          <KpiCard
            label="CTR"
            value={kpi.ctr}
            suffix="%"
            metric="ctr"
            delta={deltaArrow(kpi.ctr, yKpi?.ctr)}
          />
          <KpiCard
            label="CPM"
            value={kpi.cpm}
            prefix="$"
            suffix=" AUD"
            metric="cpm"
            delta={deltaArrow(kpi.cpm, yKpi?.cpm, true)}
          />
        </div>
      )}

      {/* Health Summary Bar */}
      {allAds.length > 0 && (
        <div className="ads-health-bar">
          <span className="ads-health-item" style={{ color: FATIGUE_COLORS.HEALTHY }}>✅ {healthCounts.HEALTHY} Healthy</span>
          <span className="ads-health-item" style={{ color: FATIGUE_COLORS.WATCH }}>⚠️ {healthCounts.WATCH} Watch</span>
          <span className="ads-health-item" style={{ color: FATIGUE_COLORS.FATIGUING }}>🔶 {healthCounts.FATIGUING} Fatiguing</span>
          <span className="ads-health-item" style={{ color: FATIGUE_COLORS.DEAD }}>🔴 {healthCounts.DEAD} Dead</span>
        </div>
      )}

      {/* Campaign Table */}
      {campaigns.length > 0 && (
        <div className="ads-section">
          <h3 className="ads-section-title">Campaigns</h3>
          <div className="ads-table-wrap">
            <table className="ads-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Budget</th>
                  <th>Spend</th>
                  <th>ROAS</th>
                  <th>CPA</th>
                  <th>CTR</th>
                  <th>CPM</th>
                  <th>Freq</th>
                  <th>Health</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <CampaignRow
                    key={c.id}
                    campaign={c}
                    expanded={expandedCampaign === c.id}
                    onExpand={id => setExpandedCampaign(prev => prev === id ? null : id)}
                    onPause={handlePauseCampaign}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      {campaigns.length > 0 && <PerformanceCharts campaigns={campaigns} />}

      {/* Not configured state */}
      {!loading && !error && !data?.ok && (
        <div className="ads-empty-state">
          <div className="ads-empty-icon">📊</div>
          <h3>Meta Ads Not Connected</h3>
          <p>Add these environment variables to Railway to connect your Meta ad account:</p>
          <code className="ads-env-block">
            META_ACCESS_TOKEN=your_token{'\n'}
            META_AD_ACCOUNT_ID=act_XXXXXXXXX{'\n'}
            META_GRI_CAMPAIGN_IDS=campaign_id_1,campaign_id_2
          </code>
        </div>
      )}
    </div>
  )
}
