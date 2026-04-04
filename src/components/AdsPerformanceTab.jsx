import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ComposedChart, Area
} from 'recharts'

// ── Business Constants ──────────────────────────────────────────────────────

const GRI = {
  aov: 126.86,
  grossMargin: 0.40,
  grossProfit: 50.74,
  ncac: 50.74,
  mediaNcac: 43.13,
  breakevenCPP: 50.74,
  targetCPP: 43.13,
  breakevenROAS: 2.50,
  targetMER: 4.0,
  scaleMER: 6.0,
  dailyMetaSpend: 210,
  dailyGoogleSpend: 200,
  monthlyAgency: 2200,
  // Framework thresholds
  fovCacGreen: 3.0,
  fovCacAmber: 1.0,
  amerGreen: 5.0,
  amerAmber: 2.0,
}

const API = '/api/ads'

const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '14d', label: '14 Days' },
  { key: '30d', label: '30 Days' },
]

const COLOURS = {
  bg: '#0D1117',
  card: '#161B22',
  border: '#30363D',
  text: '#E6EDF3',
  muted: '#7D8590',
  pink: '#E43F7B',
  green: '#3FB950',
  yellow: '#D29922',
  red: '#F85149',
  blue: '#58A6FF',
}

const HEALTH_MAP = {
  SCALE: { label: 'Scale', bg: '#3FB95020', color: '#3FB950', border: '#3FB95044' },
  HEALTHY: { label: 'Healthy', bg: '#58A6FF20', color: '#58A6FF', border: '#58A6FF44' },
  MONITOR: { label: 'Monitor', bg: '#D2992220', color: '#D29922', border: '#D2992244' },
  CULL: { label: 'Cull', bg: '#E3651D20', color: '#E3651D', border: '#E3651D44' },
  EMERGENCY: { label: 'Emergency', bg: '#F8514920', color: '#F85149', border: '#F8514944' },
}

const FATIGUE_MAP = {
  FRESH: { color: '#3FB950', label: 'Fresh' },
  HEALTHY: { color: '#3FB950', label: 'Healthy' },
  WATCH: { color: '#D29922', label: 'Watch' },
  FATIGUING: { color: '#E3651D', label: 'Fatiguing' },
  DEAD: { color: '#F85149', label: 'Dead' },
}

const OBJECTIVE_LABELS = {
  OUTCOME_SALES: 'Sales', OUTCOME_TRAFFIC: 'Traffic', OUTCOME_ENGAGEMENT: 'Engagement',
  OUTCOME_LEADS: 'Leads', OUTCOME_APP_PROMOTION: 'App', OUTCOME_AWARENESS: 'Awareness',
  CONVERSIONS: 'Conversions', LINK_CLICKS: 'Traffic', POST_ENGAGEMENT: 'Engagement',
  REACH: 'Reach', BRAND_AWARENESS: 'Awareness',
}

// ── Utility Functions ───────────────────────────────────────────────────────

function fmtCurrency(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtCompact(n) {
  if (n == null || isNaN(n)) return '--'
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K'
  return Number(n).toFixed(2)
}

function fmtInt(n) {
  if (n == null || isNaN(n)) return '--'
  return Math.round(n).toLocaleString('en-AU')
}

function cppColour(cpp) {
  if (cpp == null || isNaN(cpp)) return COLOURS.muted
  if (cpp < GRI.targetCPP) return COLOURS.green
  if (cpp <= GRI.breakevenCPP) return COLOURS.yellow
  return COLOURS.red
}

function merColour(mer) {
  if (mer == null || isNaN(mer)) return COLOURS.muted
  if (mer >= GRI.targetMER) return COLOURS.green
  if (mer >= GRI.breakevenROAS) return COLOURS.yellow
  return COLOURS.red
}

function cacColour(cac) {
  if (cac == null || isNaN(cac)) return COLOURS.muted
  if (cac < GRI.targetCPP) return COLOURS.green
  if (cac <= GRI.breakevenCPP) return COLOURS.yellow
  return COLOURS.red
}

function amerColour(amer) {
  if (amer == null || isNaN(amer)) return COLOURS.muted
  if (amer > 50) return COLOURS.green
  if (amer >= 0) return COLOURS.yellow
  return COLOURS.red
}

// ── Framework colour functions ──

function ncacColour(ncac, thresholds) {
  if (ncac == null || isNaN(ncac)) return COLOURS.muted
  if (!thresholds) return cacColour(ncac) // fallback
  if (ncac <= thresholds.green) return COLOURS.green
  if (ncac <= thresholds.amber) return COLOURS.yellow
  return COLOURS.red
}

function fovCacColour(ratio) {
  if (ratio == null || isNaN(ratio)) return COLOURS.muted
  if (ratio >= GRI.fovCacGreen) return COLOURS.green
  if (ratio >= GRI.fovCacAmber) return COLOURS.yellow
  return COLOURS.red
}

function cmColour(cm) {
  if (cm == null || isNaN(cm)) return COLOURS.muted
  if (cm > 0) return COLOURS.green
  return COLOURS.red
}

function acquisitionMerColour(amer) {
  if (amer == null || isNaN(amer)) return COLOURS.muted
  if (amer >= GRI.amerGreen) return COLOURS.green
  if (amer >= GRI.amerAmber) return COLOURS.yellow
  return COLOURS.red
}

function newCustColour(wowChange) {
  if (wowChange == null || isNaN(wowChange)) return COLOURS.muted
  if (wowChange >= 0) return COLOURS.green
  if (wowChange > -10) return COLOURS.yellow
  return COLOURS.red
}

function statusLabel(status) {
  const map = { green: 'Healthy', amber: 'Warning', red: 'Critical' }
  return map[status] || status
}

function deltaInfo(current, previous, invert = false) {
  if (previous == null || previous === 0 || current == null) return null
  const diff = current - previous
  const pct = ((diff / Math.abs(previous)) * 100).toFixed(1)
  const isGood = invert ? diff < 0 : diff > 0
  return { pct: `${diff > 0 ? '+' : ''}${pct}%`, isGood }
}

function getHealthBadge(score) {
  if (score == null) return HEALTH_MAP.MONITOR
  if (score >= 80) return HEALTH_MAP.SCALE
  if (score >= 60) return HEALTH_MAP.HEALTHY
  if (score >= 40) return HEALTH_MAP.MONITOR
  if (score >= 20) return HEALTH_MAP.CULL
  return HEALTH_MAP.EMERGENCY
}

function shortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function Skeleton({ width, height = 20 }) {
  return (
    <div className="ads-dark-skeleton" style={{ width: width || '100%', height }} />
  )
}

function SectionSkeleton({ rows = 3 }) {
  return (
    <div className="ads-dark-card" style={{ padding: 24 }}>
      <Skeleton width="30%" height={16} />
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} height={14} width={`${80 - i * 10}%`} />
        ))}
      </div>
    </div>
  )
}

// ── Confirm Modal ───────────────────────────────────────────────────────────

function ConfirmModal({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }) {
  return (
    <div className="ads-dark-overlay" onClick={onCancel}>
      <div className="ads-dark-modal" onClick={e => e.stopPropagation()}>
        <h3 className="ads-dark-modal-title">{title}</h3>
        <p className="ads-dark-modal-message">{message}</p>
        <div className="ads-dark-modal-actions">
          <button className="ads-dark-btn ads-dark-btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className={`ads-dark-btn ${danger ? 'ads-dark-btn-danger' : 'ads-dark-btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Budget Editor ───────────────────────────────────────────────────────────

function BudgetEditor({ currentBudget, entityId, entityType, onSave, onCancel }) {
  const [value, setValue] = useState(currentBudget?.toFixed(2) || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) return
    setSaving(true)
    try {
      const res = await fetch(`${API}/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, entityType, dailyBudget: num })
      })
      const data = await res.json()
      if (data.ok !== false) onSave(num)
    } catch (err) {
      console.error('Budget update failed:', err)
    }
    setSaving(false)
  }

  return (
    <div className="ads-dark-budget-editor" onClick={e => e.stopPropagation()}>
      <span style={{ color: COLOURS.muted, fontSize: 11 }}>$</span>
      <input
        type="number"
        className="ads-dark-budget-input"
        value={value}
        onChange={e => setValue(e.target.value)}
        min="0"
        step="1"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button className="ads-dark-btn-micro ads-dark-btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? '...' : 'Apply'}
      </button>
      <button className="ads-dark-btn-micro ads-dark-btn-ghost" onClick={onCancel}>X</button>
    </div>
  )
}

// ── Metric Definitions Modal ────────────────────────────────────────────────

function MetricDefinitions({ onClose }) {
  const definitions = [
    { term: 'CM$ (Contribution Margin)', desc: 'Revenue minus cost of goods, shipping, payment fees, and total ad spend. THE scoreboard metric. If CM$ is negative, nothing else matters until you fix it. This is Layer 1.' },
    { term: 'MER (Marketing Efficiency Ratio)', desc: 'Total Shopify revenue divided by total ad spend across all channels. Unlike Meta ROAS, MER captures the true blended return including organic uplift from ads. Target: 4.0x+ for GRI.' },
    { term: 'nCAC (New Customer Acquisition Cost)', desc: 'Total ad spend divided by NEW customers only (not total orders). Uses email-based customer classification from Shopify. Green = below 90-day average, amber = 45% above, red = 2x above. This is the real acquisition cost.' },
    { term: 'FOV/CAC (First Order Value / CAC)', desc: 'First order profitability: (First Order AOV x Gross Margin) / nCAC. Green = 3.0x+ (strong first-order profit), amber = 1.0-3.0x (marginal), red = below 1.0x (underwater on first order).' },
    { term: 'aMER (Acquisition MER)', desc: 'New customer revenue divided by total ad spend. Isolates how efficiently ads acquire NEW revenue vs. retaining existing. Green = 5x+, amber = 2-5x, red = below 2x.' },
    { term: 'LTGP:nCAC (Lifetime Gross Profit / nCAC)', desc: 'Cumulative gross profit per customer over their lifetime divided by nCAC. Phase 3 metric, needs 30+ days of cohort data. The ultimate measure of sustainable growth.' },
    { term: 'Repeat Rate', desc: 'Percentage of orders from returning customers. Higher repeat rate means more organic revenue and lower effective acquisition cost.' },
    { term: 'Meta ROAS / CPA', desc: 'Channel-reported metrics. Layer 4 proxies shown collapsed by default. Use for relative comparison between campaigns only, never for business decisions. Meta overcounts by ~3x.' },
  ]

  return (
    <div className="ads-dark-overlay" onClick={onClose}>
      <div className="ads-dark-modal ads-dark-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="ads-dark-modal-header">
          <h3 className="ads-dark-modal-title">Metric Definitions</h3>
          <button className="ads-dark-btn-icon" onClick={onClose}>X</button>
        </div>
        <div className="ads-dark-definitions">
          {definitions.map((d, i) => (
            <div key={i} className="ads-dark-definition">
              <dt>{d.term}</dt>
              <dd>{d.desc}</dd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Command Bar ─────────────────────────────────────────────────────────────

function CommandBar({ dateRange, onDateChange, lastSynced, onRefresh, refreshing, onHealthCheck, healthCheckLoading, onShowDefinitions }) {
  return (
    <div className="ads-dark-command-bar">
      <div className="ads-dark-command-left">
        <h1 className="ads-dark-title">Ads Command Centre</h1>
        <button className="ads-dark-btn-icon ads-dark-help-btn" onClick={onShowDefinitions} title="Metric definitions">
          ?
        </button>
      </div>
      <div className="ads-dark-command-centre">
        <div className="ads-dark-date-pills">
          {DATE_RANGES.map(r => (
            <button
              key={r.key}
              className={`ads-dark-pill ${dateRange === r.key ? 'ads-dark-pill-active' : ''}`}
              onClick={() => onDateChange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="ads-dark-command-right">
        {lastSynced && (
          <span className="ads-dark-synced">
            Synced {new Date(lastSynced).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button className="ads-dark-btn ads-dark-btn-ghost" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Syncing...' : 'Refresh'}
        </button>
        <button
          className="ads-dark-btn ads-dark-btn-accent"
          onClick={onHealthCheck}
          disabled={healthCheckLoading}
        >
          {healthCheckLoading ? 'Analysing...' : 'Health Check'}
        </button>
      </div>
    </div>
  )
}

// ── Alert Bar ───────────────────────────────────────────────────────────────

function AlertBar({ alerts, onDismiss, onAction }) {
  if (!alerts || alerts.length === 0) return null

  const severityStyles = {
    CRITICAL: { bg: '#F8514918', border: '#F8514944', color: '#F85149', icon: '!!' },
    HIGH: { bg: '#D2992218', border: '#D2992244', color: '#D29922', icon: '!' },
    OPPORTUNITY: { bg: '#3FB95018', border: '#3FB95044', color: '#3FB950', icon: '+' },
  }

  return (
    <div className="ads-dark-alerts">
      {alerts.map((alert, i) => {
        const style = severityStyles[alert.severity] || severityStyles.HIGH
        return (
          <div key={i} className="ads-dark-alert" style={{ background: style.bg, borderColor: style.border }}>
            <span className="ads-dark-alert-icon" style={{ color: style.color }}>{style.icon}</span>
            <span className="ads-dark-alert-message">{alert.message}</span>
            {alert.action && (
              <button className="ads-dark-btn-micro" style={{ color: style.color }} onClick={() => onAction && onAction(alert)}>
                {alert.actionLabel || 'Fix'}
              </button>
            )}
            <button className="ads-dark-alert-dismiss" onClick={() => onDismiss(i)}>x</button>
          </div>
        )
      })}
    </div>
  )
}

// ── Profitability Dashboard (4-Layer Hierarchy) ───────────────────────────
// Layer 1: CM$ (Scoreboard) → Layer 2: Business → Layer 3: Customer → Layer 4: Channel

function ProfitabilityDashboard({ profitability, loading }) {
  const [showLayer4, setShowLayer4] = useState(false)

  if (loading) {
    return (
      <div className="ads-dark-truth-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="ads-dark-truth-card">
            <Skeleton width="60%" height={12} />
            <Skeleton width="40%" height={32} />
          </div>
        ))}
      </div>
    )
  }

  if (!profitability) return null

  const { layer1, layer2, layer3, layer4, days } = profitability
  const dailyAvgSpend = layer2.adSpend && days ? layer2.adSpend / days : 0

  return (
    <div className="ads-profitability-dashboard">
      {/* ─── LAYER 1: SCOREBOARD ─── */}
      <div className={`ads-dark-cm-scoreboard ads-dark-cm-${layer1.cmStatus}`}>
        <div className="ads-dark-cm-header">
          <span className="ads-dark-cm-label">CONTRIBUTION MARGIN</span>
          <span className="ads-dark-cm-badge">{statusLabel(layer1.cmStatus).toUpperCase()}</span>
        </div>
        <div className="ads-dark-cm-value">{fmtCurrency(layer1.cm)}</div>
        <div className="ads-dark-cm-sub">
          {layer1.cm < 0
            ? 'CM is negative. Fix this before looking at anything else.'
            : layer1.cmTrend > 0 ? `+${layer1.cmTrend}% vs prev period` : `${layer1.cmTrend}% vs prev period`}
        </div>
      </div>

      {/* ─── LAYER 2: BUSINESS METRICS ─── */}
      <div className="ads-dark-layer-label">BUSINESS</div>
      <div className="ads-dark-truth-grid ads-dark-truth-grid-4">
        <div className="ads-dark-truth-card">
          <div className="ads-dark-truth-label">Revenue</div>
          <div className="ads-dark-truth-value" style={{ color: COLOURS.green }}>
            {fmtCurrency(layer2.revenue)}
          </div>
          <div className="ads-dark-truth-sub">{fmtInt(layer2.orders)} orders</div>
        </div>

        <div className="ads-dark-truth-card">
          <div className="ads-dark-truth-label">Ad Spend</div>
          <div className="ads-dark-truth-value" style={{ color: COLOURS.text }}>
            {fmtCurrency(layer2.adSpend)}
          </div>
          <div className="ads-dark-truth-sub">{fmtCurrency(dailyAvgSpend)}/day avg</div>
          {layer2.googleHasData ? (
            <div className="ads-dark-truth-target" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879v-6.988h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" fill="#1877F2"/></svg>
              {fmtCurrency(layer2.metaSpend)}
              <span style={{ color: COLOURS.muted }}>+</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              {fmtCurrency(layer2.googleSpend)}
            </div>
          ) : (
            <div className="ads-dark-truth-target" style={{ color: COLOURS.yellow }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4, verticalAlign: 'middle' }}><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879v-6.988h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" fill="#1877F2"/></svg>
              Meta only — Google not connected
            </div>
          )}
        </div>

        <div className="ads-dark-truth-card">
          <div className="ads-dark-truth-label">MER</div>
          <div className="ads-dark-truth-value" style={{ color: merColour(layer2.mer) }}>
            {layer2.mer != null ? layer2.mer.toFixed(2) + 'x' : '--'}
          </div>
          <div className="ads-dark-truth-sub">
            {layer2.mer >= GRI.targetMER ? 'Above target' : layer2.mer >= GRI.breakevenROAS ? 'Above breakeven' : 'Below breakeven'}
          </div>
          <div className="ads-dark-truth-target">Target: {GRI.targetMER}x</div>
        </div>

        <div className="ads-dark-truth-card">
          <div className="ads-dark-truth-label">AOV</div>
          <div className="ads-dark-truth-value" style={{ color: COLOURS.text }}>
            {fmtCurrency(layer2.aov)}
          </div>
          <div className="ads-dark-truth-sub">Blended average</div>
        </div>
      </div>

      {/* ─── LAYER 3: CUSTOMER METRICS ─── */}
      <div className="ads-dark-layer-label">CUSTOMER ACQUISITION</div>
      <div className="ads-dark-truth-grid ads-dark-truth-grid-6">
        <div className="ads-dark-truth-card">
          <div className="ads-dark-truth-label">nCAC</div>
          <div className="ads-dark-truth-value" style={{ color: ncacColour(layer3.ncac, layer3.ncacThresholds) }}>
            {layer3.ncac ? fmtCurrency(layer3.ncac) : '--'}
          </div>
          <div className="ads-dark-truth-sub" style={{ color: ncacColour(layer3.ncac, layer3.ncacThresholds) }}>
            {layer3.ncacStatus === 'green' ? 'Below baseline' : layer3.ncacStatus === 'amber' ? 'Above baseline' : 'Critical'}
          </div>
          <div className="ads-dark-truth-target">
            Baseline: {fmtCurrency(layer3.ncacThresholds?.green)}
          </div>
        </div>

        <div className="ads-dark-truth-card">
          <div className="ads-dark-truth-label">FOV/CAC</div>
          <div className="ads-dark-truth-value" style={{ color: fovCacColour(layer3.fovCac) }}>
            {layer3.fovCac ? layer3.fovCac.toFixed(2) + 'x' : '--'}
          </div>
          <div className="ads-dark-truth-sub" style={{ color: fovCacColour(layer3.fovCac) }}>
            {layer3.fovCac >= GRI.fovCacGreen ? 'First order profitable' : layer3.fovCac >= GRI.fovCacAmber ? 'Marginal' : 'Underwater'}
          </div>
          <div className="ads-dark-truth-target">
            1st AOV: {fmtCurrency(layer3.firstOrderAov)}
          </div>
        </div>

        <div className="ads-dark-truth-card" style={{ opacity: 0.4 }}>
          <div className="ads-dark-truth-label">LTGP:nCAC</div>
          <div className="ads-dark-truth-value" style={{ color: COLOURS.muted }}>--</div>
          <div className="ads-dark-truth-sub">Phase 3</div>
          <div className="ads-dark-truth-target">Needs 30d+ data</div>
        </div>

        <div className="ads-dark-truth-card">
          <div className="ads-dark-truth-label">Repeat Rate</div>
          <div className="ads-dark-truth-value" style={{ color: COLOURS.text }}>
            {layer3.repeatRate != null ? layer3.repeatRate.toFixed(1) + '%' : '--'}
          </div>
          <div className="ads-dark-truth-sub">
            {layer3.returningCustomers} returning
          </div>
        </div>

        <div className="ads-dark-truth-card">
          <div className="ads-dark-truth-label">aMER</div>
          <div className="ads-dark-truth-value" style={{ color: acquisitionMerColour(layer3.amer) }}>
            {layer3.amer ? layer3.amer.toFixed(2) + 'x' : '--'}
          </div>
          <div className="ads-dark-truth-sub" style={{ color: acquisitionMerColour(layer3.amer) }}>
            {layer3.amerStatus === 'green' ? 'Strong acquisition' : layer3.amerStatus === 'amber' ? 'Moderate' : 'Weak acquisition'}
          </div>
          <div className="ads-dark-truth-target">Target: &gt;{GRI.amerGreen}x</div>
        </div>

        <div className="ads-dark-truth-card">
          <div className="ads-dark-truth-label">New Customers</div>
          <div className="ads-dark-truth-value" style={{ color: newCustColour(layer3.newCustWowChange) }}>
            {layer3.newCustomers != null ? fmtInt(layer3.newCustomers) : '--'}
          </div>
          <div className="ads-dark-truth-sub" style={{ color: newCustColour(layer3.newCustWowChange) }}>
            {layer3.newCustWowChange > 0 ? '+' : ''}{layer3.newCustWowChange}% WoW
          </div>
          <div className="ads-dark-truth-target">
            {fmtCurrency(layer3.newCustomerRevenue)} revenue
          </div>
        </div>
      </div>

      {/* ─── LAYER 4: CHANNEL PROXIES ─── */}
      <div
        className="ads-dark-layer-label ads-dark-layer-label-toggle"
        onClick={() => setShowLayer4(!showLayer4)}
        style={{ cursor: 'pointer', opacity: 0.5 }}
      >
        CHANNEL PROXIES {showLayer4 ? '▾' : '▸'}
        <span style={{ fontSize: 10, marginLeft: 8, fontWeight: 400 }}>for relative comparison only</span>
      </div>
      {showLayer4 && (
        <div className="ads-dark-truth-grid" style={{ opacity: 0.5 }}>
          <div className="ads-dark-truth-card">
            <div className="ads-dark-truth-label">Meta ROAS</div>
            <div className="ads-dark-truth-value" style={{ color: COLOURS.muted }}>
              {layer4.metaRoas ? layer4.metaRoas.toFixed(2) + 'x' : '--'}
            </div>
            <div className="ads-dark-truth-sub">{layer4.metaPurchases} Meta claims</div>
          </div>

          <div className="ads-dark-truth-card">
            <div className="ads-dark-truth-label">Meta CPA</div>
            <div className="ads-dark-truth-value" style={{ color: COLOURS.muted }}>
              {layer4.metaCpa ? fmtCurrency(layer4.metaCpa) : '--'}
            </div>
            <div className="ads-dark-truth-sub">Proxy — not nCAC</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Spend vs Revenue Chart ──────────────────────────────────────────────────

function SpendChart({ breakdown, loading }) {
  if (loading) return <SectionSkeleton rows={1} />
  if (!breakdown || breakdown.length === 0) return null

  const chartData = breakdown.map(d => ({
    date: shortDate(d.date),
    spend: d.spend || 0,
    revenue: d.revenue || 0,
    breakevenRev: d.spend ? d.spend / GRI.grossMargin : 0,
  }))

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
      <div className="ads-dark-chart-tooltip">
        <div className="ads-dark-tooltip-date">{d.date}</div>
        <div style={{ color: COLOURS.pink }}>Spend: {fmtCurrency(d.spend)}</div>
        <div style={{ color: COLOURS.green }}>Revenue: {fmtCurrency(d.revenue)}</div>
        <div style={{ color: COLOURS.muted }}>ROAS: {d.spend > 0 ? (d.revenue / d.spend).toFixed(2) + 'x' : '--'}</div>
      </div>
    )
  }

  return (
    <div className="ads-dark-card ads-dark-chart-section">
      <h3 className="ads-dark-section-title">Spend vs Revenue</h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOURS.border} />
          <XAxis dataKey="date" tick={{ fill: COLOURS.muted, fontSize: 11 }} stroke={COLOURS.border} />
          <YAxis
            yAxisId="spend"
            tick={{ fill: COLOURS.muted, fontSize: 11 }}
            stroke={COLOURS.border}
            tickFormatter={v => '$' + fmtCompact(v)}
          />
          <YAxis
            yAxisId="revenue"
            orientation="right"
            tick={{ fill: COLOURS.muted, fontSize: 11 }}
            stroke={COLOURS.border}
            tickFormatter={v => '$' + fmtCompact(v)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ color: COLOURS.muted, fontSize: 12 }}
          />
          <Area
            yAxisId="revenue"
            type="monotone"
            dataKey="revenue"
            fill={COLOURS.green + '15'}
            stroke={COLOURS.green}
            strokeWidth={2}
            name="Revenue"
            dot={{ r: 3, fill: COLOURS.green }}
          />
          <Line
            yAxisId="spend"
            type="monotone"
            dataKey="spend"
            stroke={COLOURS.pink}
            strokeWidth={2}
            name="Spend"
            dot={{ r: 3, fill: COLOURS.pink }}
          />
          <Line
            yAxisId="revenue"
            type="monotone"
            dataKey="breakevenRev"
            stroke={COLOURS.yellow}
            strokeWidth={1}
            strokeDasharray="6 4"
            name="Breakeven Line"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Surgical Actions Panel ──────────────────────────────────────────────────

const ACTION_ICONS = {
  PAUSE: { icon: '\u23F8', label: 'Pause' },
  SCALE_BUDGET: { icon: '\u2197', label: 'Scale' },
  REDUCE_BUDGET: { icon: '\u2198', label: 'Reduce' },
  REPLACE_CREATIVE: { icon: '\u267B', label: 'Replace' },
  REFRESH_AUDIENCE: { icon: '\uD83C\uDFAF', label: 'Refresh' },
  PROTECT: { icon: '\u2705', label: 'Protect' },
  WATCH: { icon: '\uD83D\uDC41', label: 'Watch' },
}

const PRIORITY_STYLES = {
  URGENT: { bg: '#F8514930', border: '#F85149', color: '#F85149', label: 'URGENT' },
  HIGH: { bg: '#E3651D30', border: '#E3651D', color: '#E3651D', label: 'HIGH' },
  MEDIUM: { bg: '#D2992230', border: '#D29922', color: '#D29922', label: 'MEDIUM' },
  LOW: { bg: '#3FB95020', border: '#3FB950', color: '#3FB950', label: 'INFO' },
}

function SurgicalActions({ actions, onPauseEntity, refreshData }) {
  if (!actions || actions.length === 0) {
    return (
      <div className="ads-dark-surgical-section">
        <h4 className="ads-dark-subsection-title">Surgical Actions</h4>
        <div style={{ color: COLOURS.muted, padding: '8px 0', fontSize: 13 }}>
          No immediate actions needed. All elements performing within thresholds.
        </div>
      </div>
    )
  }

  const urgentActions = actions.filter(a => a.priority === 'URGENT' || a.priority === 'HIGH')
  const otherActions = actions.filter(a => a.priority !== 'URGENT' && a.priority !== 'HIGH')

  return (
    <div className="ads-dark-surgical-section">
      <h4 className="ads-dark-subsection-title">
        Surgical Actions
        {urgentActions.length > 0 && (
          <span style={{ color: COLOURS.red, fontSize: 12, marginLeft: 8 }}>
            {urgentActions.length} urgent
          </span>
        )}
      </h4>
      <div className="ads-dark-surgical-list">
        {actions.map((action, i) => {
          const pStyle = PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.MEDIUM
          const aInfo = ACTION_ICONS[action.action] || ACTION_ICONS.WATCH
          const isPauseAction = action.action === 'PAUSE'

          return (
            <div key={i} className="ads-dark-surgical-item" style={{ borderLeftColor: pStyle.border }}>
              <div className="ads-dark-surgical-header">
                <span className="ads-dark-surgical-priority" style={{ background: pStyle.bg, color: pStyle.color, borderColor: pStyle.border }}>
                  {pStyle.label}
                </span>
                <span className="ads-dark-surgical-action-badge">
                  {aInfo.icon} {aInfo.label}
                </span>
                <span className="ads-dark-surgical-level" style={{ color: COLOURS.muted }}>
                  {action.level === 'adset' ? 'Ad Set' : 'Ad'}
                </span>
              </div>
              <div className="ads-dark-surgical-entity" style={{ color: COLOURS.text }}>
                {action.entityName}
              </div>
              <div className="ads-dark-surgical-reason" style={{ color: COLOURS.muted }}>
                {action.reason}
              </div>
              <div className="ads-dark-surgical-impact" style={{ color: pStyle.color }}>
                {action.impact}
              </div>
              {isPauseAction && onPauseEntity && (
                <button
                  className="ads-dark-btn-micro ads-dark-btn-danger"
                  style={{ marginTop: 6 }}
                  onClick={async () => {
                    await fetch(`${API}/status`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        entityId: action.entityId,
                        entityType: action.level === 'adset' ? 'adset' : 'ad',
                        status: 'PAUSED'
                      })
                    })
                    refreshData && refreshData()
                  }}
                >
                  Pause Now
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Creative Card (Ad) ──────────────────────────────────────────────────────

function CreativeCard({ ad, onPause, pausing }) {
  const ins = ad.insights || {}
  const cpp = ins.purchases > 0 ? ins.spend / ins.purchases : null
  const fatigue = FATIGUE_MAP[ad.fatigue?.status] || FATIGUE_MAP.HEALTHY

  return (
    <div className="ads-dark-creative-card">
      <div className="ads-dark-creative-thumb">
        {ad.thumbnailUrl ? (
          <img src={ad.thumbnailUrl} alt="" />
        ) : (
          <div className="ads-dark-creative-placeholder">No Preview</div>
        )}
      </div>
      <div className="ads-dark-creative-info">
        <div className="ads-dark-creative-name">{ad.name}</div>
        <div className="ads-dark-creative-stats">
          <span>Spend: {fmtCurrency(ins.spend)}</span>
          <span>Purchases: {ins.purchases || 0}</span>
          <span style={{ color: cppColour(cpp) }}>CPP: {cpp != null ? fmtCurrency(cpp) : '--'}</span>
          <span>CTR: {ins.ctr != null ? ins.ctr.toFixed(2) + '%' : '--'}</span>
          <span>Freq: {ins.frequency != null ? ins.frequency.toFixed(1) : '--'}</span>
        </div>
        <div className="ads-dark-creative-footer">
          <span className="ads-dark-fatigue-badge" style={{ color: fatigue.color, borderColor: fatigue.color + '66' }}>
            {fatigue.label} {ad.fatigue?.score != null ? `(${ad.fatigue.score})` : ''}
          </span>
          {ad.daysRunning != null && (
            <span className="ads-dark-creative-days">{ad.daysRunning}d running</span>
          )}
          {ad.status === 'ACTIVE' && (
            <button
              className="ads-dark-btn-micro ads-dark-btn-danger"
              onClick={() => onPause(ad.id)}
              disabled={pausing}
            >
              {pausing ? '...' : 'Pause'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Ad Set Row ──────────────────────────────────────────────────────────────

function AdSetRow({ adset, onBudgetSave }) {
  const [editingBudget, setEditingBudget] = useState(false)
  const ins = adset.insights || {}
  const cpp = ins.purchases > 0 ? ins.spend / ins.purchases : null

  const isLearningLimited = adset.status === 'LEARNING_LIMITED' || adset.deliveryStatus === 'LEARNING_LIMITED'
  const isLearning = adset.status === 'LEARNING' || adset.deliveryStatus === 'LEARNING'

  // Estimate budget needed to exit learning limited (~50 conversions/week at current CPP)
  const budgetToExitLearning = cpp ? (50 * cpp / 7) : null

  return (
    <tr className="ads-dark-adset-row">
      <td className="ads-dark-adset-name">
        {adset.name}
      </td>
      <td>
        {isLearningLimited ? (
          <span className="ads-dark-learning-badge ads-dark-learning-limited">
            Learning Limited
            {budgetToExitLearning && (
              <span className="ads-dark-learning-hint">
                Need {fmtCurrency(budgetToExitLearning)}/day to exit
              </span>
            )}
          </span>
        ) : isLearning ? (
          <span className="ads-dark-learning-badge ads-dark-learning-active">Learning</span>
        ) : (
          <span className="ads-dark-learning-badge ads-dark-learning-ok">Active</span>
        )}
      </td>
      <td>{fmtCurrency(ins.spend)}</td>
      <td>{ins.purchases || 0}</td>
      <td style={{ color: cppColour(cpp) }}>{cpp != null ? fmtCurrency(cpp) : '--'}</td>
      <td>{ins.frequency != null ? ins.frequency.toFixed(1) : '--'}</td>
      <td onClick={e => e.stopPropagation()}>
        {editingBudget ? (
          <BudgetEditor
            currentBudget={adset.dailyBudget || ins.dailyBudget || 0}
            entityId={adset.id}
            entityType="adset"
            onSave={(v) => { setEditingBudget(false); onBudgetSave && onBudgetSave(adset.id, v) }}
            onCancel={() => setEditingBudget(false)}
          />
        ) : (
          <span className="ads-dark-budget-display" onClick={() => setEditingBudget(true)}>
            {fmtCurrency(adset.dailyBudget || ins.dailyBudget)} <span className="ads-dark-edit-icon">edit</span>
          </span>
        )}
      </td>
    </tr>
  )
}

// ── Campaign Row ────────────────────────────────────────────────────────────

function CampaignRow({ campaign, expanded, onExpand, onStatusChange, onBudgetSave, onRequestVerdict, verdicts, refreshData }) {
  const [editingBudget, setEditingBudget] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [pausingAdId, setPausingAdId] = useState(null)

  const ins = campaign.insights || {}
  const cpp = ins.purchases > 0 ? ins.spend / ins.purchases : null
  const trueContribution = ins.purchases ? (ins.purchases * GRI.grossProfit) - ins.spend : null
  const healthBadge = getHealthBadge(campaign.healthScore)
  const verdict = verdicts?.[campaign.id]

  const handleStatusToggle = () => {
    const newStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    setConfirmAction({
      title: `${newStatus === 'PAUSED' ? 'Pause' : 'Activate'} Campaign`,
      message: `This goes live immediately. "${campaign.name}" will be ${newStatus === 'PAUSED' ? 'paused' : 'activated'}.`,
      onConfirm: async () => {
        await fetch(`${API}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityId: campaign.id, entityType: 'campaign', status: newStatus })
        })
        setConfirmAction(null)
        refreshData && refreshData()
      }
    })
  }

  const handlePauseAd = async (adId) => {
    setPausingAdId(adId)
    try {
      await fetch(`${API}/pause/${adId}`, { method: 'POST' })
      refreshData && refreshData()
    } catch (err) {
      console.error('Failed to pause ad:', err)
    }
    setPausingAdId(null)
  }

  return (
    <>
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
          confirmLabel="Yes, do it"
          danger={true}
        />
      )}
      <tr className={`ads-dark-campaign-row ${expanded ? 'ads-dark-row-expanded' : ''}`} onClick={() => onExpand(campaign.id)}>
        {/* Status Toggle */}
        <td onClick={e => e.stopPropagation()}>
          <button
            className={`ads-dark-status-toggle ${campaign.status === 'ACTIVE' ? 'ads-dark-toggle-on' : 'ads-dark-toggle-off'}`}
            onClick={handleStatusToggle}
            title={campaign.status === 'ACTIVE' ? 'Pause campaign' : 'Activate campaign'}
          />
        </td>

        {/* Name */}
        <td className="ads-dark-campaign-name">
          <span className="ads-dark-expand-arrow">{expanded ? '\u25BC' : '\u25B6'}</span>
          <span>{campaign.name}</span>
          {campaign.objective && (
            <span className="ads-dark-objective-tag">
              {OBJECTIVE_LABELS[campaign.objective] || campaign.objective}
            </span>
          )}
        </td>

        {/* Health Badge */}
        <td>
          <span className="ads-dark-health-badge" style={{ background: healthBadge.bg, color: healthBadge.color, borderColor: healthBadge.border }}>
            {healthBadge.label}
          </span>
        </td>

        {/* Spend */}
        <td>{fmtCurrency(ins.spend)}</td>

        {/* Purchases */}
        <td>{ins.purchases || 0}</td>

        {/* CPP */}
        <td style={{ color: cppColour(cpp), fontWeight: 700 }}>
          {cpp != null ? fmtCurrency(cpp) : '--'}
        </td>

        {/* Meta ROAS (greyed) */}
        <td style={{ color: COLOURS.muted, fontStyle: 'italic' }}>
          {ins.roas != null ? ins.roas.toFixed(2) + 'x' : '--'}
          <div style={{ fontSize: 9, opacity: 0.6 }}>Meta claims</div>
        </td>

        {/* True Contribution */}
        <td style={{ color: trueContribution != null ? (trueContribution >= 0 ? COLOURS.green : COLOURS.red) : COLOURS.muted, fontWeight: 600 }}>
          {trueContribution != null ? (trueContribution >= 0 ? '+' : '') + fmtCurrency(trueContribution) : '--'}
        </td>

        {/* Budget */}
        <td onClick={e => e.stopPropagation()}>
          {editingBudget ? (
            <BudgetEditor
              currentBudget={campaign.dailyBudget || 0}
              entityId={campaign.id}
              entityType="campaign"
              onSave={(v) => { setEditingBudget(false); onBudgetSave && onBudgetSave(campaign.id, v) }}
              onCancel={() => setEditingBudget(false)}
            />
          ) : (
            <span className="ads-dark-budget-display" onClick={() => setEditingBudget(true)}>
              {fmtCurrency(campaign.dailyBudget)} <span className="ads-dark-edit-icon">edit</span>
            </span>
          )}
        </td>

        {/* AI Verdict */}
        <td onClick={e => e.stopPropagation()}>
          {verdict ? (
            <span className={`ads-dark-verdict-chip ads-dark-verdict-${verdict.urgency?.toLowerCase()}`}>
              {verdict.verdict || verdict.headline}
            </span>
          ) : (
            <button className="ads-dark-btn-micro ads-dark-btn-ai" onClick={() => onRequestVerdict(campaign)}>
              AI
            </button>
          )}
        </td>
      </tr>

      {/* Expanded: Surgical Actions + Ad Sets + Creatives */}
      {expanded && (
        <tr className="ads-dark-expand-row">
          <td colSpan={10} style={{ padding: 0 }}>
            {/* Surgical Actions — always first */}
            <SurgicalActions
              actions={campaign.surgicalActions}
              onPauseEntity={true}
              refreshData={refreshData}
            />

            {/* Ad Sets */}
            {campaign.adsets?.length > 0 && (
              <div className="ads-dark-adsets-section">
                <h4 className="ads-dark-subsection-title">Ad Sets</h4>
                <table className="ads-dark-adsets-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Spend</th>
                      <th>Purchases</th>
                      <th>CPP</th>
                      <th>Frequency</th>
                      <th>Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaign.adsets.map(adset => (
                      <AdSetRow key={adset.id} adset={adset} onBudgetSave={onBudgetSave} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Creatives */}
            {campaign.ads?.length > 0 && (
              <div className="ads-dark-creatives-section">
                <h4 className="ads-dark-subsection-title">Creatives</h4>
                <div className="ads-dark-creatives-grid">
                  {campaign.ads.map(ad => (
                    <CreativeCard
                      key={ad.id}
                      ad={ad}
                      onPause={handlePauseAd}
                      pausing={pausingAdId === ad.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {(!campaign.ads?.length && !campaign.adsets?.length) && (
              <div className="ads-dark-empty-expand">No ad sets or creatives found for this campaign.</div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Campaign Table ──────────────────────────────────────────────────────────

function CampaignTable({ campaigns, loading, verdicts, onRequestVerdict, refreshData }) {
  const [expandedId, setExpandedId] = useState(null)
  const [budgetConfirm, setBudgetConfirm] = useState(null)

  const handleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const handleBudgetSave = (entityId, newBudget) => {
    refreshData && refreshData()
  }

  if (loading) return <SectionSkeleton rows={5} />

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="ads-dark-card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>--</div>
        <div style={{ color: COLOURS.muted }}>No campaigns found. Check your Meta Ads connection.</div>
      </div>
    )
  }

  return (
    <div className="ads-dark-card ads-dark-table-section">
      <h3 className="ads-dark-section-title">Campaigns</h3>
      <div className="ads-dark-table-wrap">
        <table className="ads-dark-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Campaign</th>
              <th>Health</th>
              <th>Spend</th>
              <th>Purch.</th>
              <th>CPP</th>
              <th>Meta ROAS</th>
              <th>True Contribution</th>
              <th>Budget</th>
              <th>AI</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <CampaignRow
                key={c.id}
                campaign={c}
                expanded={expandedId === c.id}
                onExpand={handleExpand}
                onBudgetSave={handleBudgetSave}
                onRequestVerdict={onRequestVerdict}
                verdicts={verdicts}
                refreshData={refreshData}
              />
            ))}
          </tbody>
        </table>
      </div>

      {budgetConfirm && (
        <ConfirmModal
          title="Update Budget"
          message={budgetConfirm.message}
          onConfirm={budgetConfirm.onConfirm}
          onCancel={() => setBudgetConfirm(null)}
          confirmLabel="Apply"
        />
      )}
    </div>
  )
}

// ── AI Recommendations Panel ────────────────────────────────────────────────

function AIRecommendations({ loading, recommendations, onRefresh, verdicts }) {
  const [expandedVerdict, setExpandedVerdict] = useState(null)

  if (loading) return <SectionSkeleton rows={4} />

  if (!recommendations) {
    return (
      <div className="ads-dark-card" style={{ padding: 24 }}>
        <div className="ads-dark-section-header">
          <h3 className="ads-dark-section-title">Strategic Intelligence</h3>
          <button className="ads-dark-btn ads-dark-btn-ghost" onClick={onRefresh}>Generate Analysis</button>
        </div>
        <p style={{ color: COLOURS.muted, marginTop: 12 }}>Click Generate Analysis to get AI-powered account recommendations.</p>
      </div>
    )
  }

  return (
    <div className="ads-dark-card ads-dark-ai-section">
      <div className="ads-dark-section-header">
        <h3 className="ads-dark-section-title">Strategic Intelligence</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {recommendations.generatedAt && (
            <span style={{ color: COLOURS.muted, fontSize: 11 }}>
              {new Date(recommendations.generatedAt).toLocaleString('en-AU')}
            </span>
          )}
          <button className="ads-dark-btn ads-dark-btn-ghost" onClick={onRefresh}>Refresh</button>
        </div>
      </div>

      <div className="ads-dark-ai-grid">
        {/* Situation */}
        {recommendations.situation && (
          <div className="ads-dark-ai-block">
            <h4 className="ads-dark-ai-block-title">Situation</h4>
            <p className="ads-dark-ai-block-text">{recommendations.situation}</p>
          </div>
        )}

        {/* Immediate Actions */}
        {recommendations.immediateActions?.length > 0 && (
          <div className="ads-dark-ai-block">
            <h4 className="ads-dark-ai-block-title" style={{ color: COLOURS.red }}>Immediate Actions</h4>
            <ul className="ads-dark-ai-list">
              {recommendations.immediateActions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        {/* This Week */}
        {recommendations.thisWeek?.length > 0 && (
          <div className="ads-dark-ai-block">
            <h4 className="ads-dark-ai-block-title" style={{ color: COLOURS.yellow }}>This Week</h4>
            <ul className="ads-dark-ai-list">
              {recommendations.thisWeek.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        {/* Scale Path */}
        {recommendations.scalePath && (
          <div className="ads-dark-ai-block">
            <h4 className="ads-dark-ai-block-title" style={{ color: COLOURS.green }}>Scale Path</h4>
            <p className="ads-dark-ai-block-text">{recommendations.scalePath}</p>
          </div>
        )}
      </div>

      {/* Per-campaign verdict chips */}
      {verdicts && Object.keys(verdicts).length > 0 && (
        <div className="ads-dark-verdict-section">
          <h4 className="ads-dark-subsection-title">Campaign Verdicts</h4>
          <div className="ads-dark-verdict-chips">
            {Object.entries(verdicts).map(([id, v]) => (
              <div key={id} className="ads-dark-verdict-item">
                <button
                  className={`ads-dark-verdict-chip ads-dark-verdict-${v.urgency?.toLowerCase()} ads-dark-verdict-expand`}
                  onClick={() => setExpandedVerdict(expandedVerdict === id ? null : id)}
                >
                  {v.headline || v.verdict}
                </button>
                {expandedVerdict === id && (
                  <div className="ads-dark-verdict-detail">
                    {v.reasoning && <p>{v.reasoning}</p>}
                    {v.specificAction && <p style={{ color: COLOURS.blue }}>{v.specificAction}</p>}
                    {v.budgetSuggestion && <p style={{ color: COLOURS.yellow }}>Budget: {v.budgetSuggestion}</p>}
                    {v.estimatedImpact && <p style={{ color: COLOURS.green }}>Impact: {v.estimatedImpact}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Scale Path Calculator ───────────────────────────────────────────────────

function ScalePathCalc({ scalePath, loading }) {
  if (loading) return <SectionSkeleton rows={3} />
  if (!scalePath) return null

  const current = scalePath.current || {}
  const targets = scalePath.targets || []

  // Calculate key thresholds
  const millionYearDaily = 1000000 / 365
  const twoMillionYearDaily = 2000000 / 365

  const dailyRevNeeded1M = millionYearDaily
  const dailyRevNeeded2M = twoMillionYearDaily

  const dailySpendFor1M = current.mer ? dailyRevNeeded1M / current.mer : null
  const dailySpendFor2M = current.mer ? dailyRevNeeded2M / current.mer : null

  return (
    <div className="ads-dark-card ads-dark-scale-section">
      <h3 className="ads-dark-section-title">Scale Path Calculator</h3>

      {/* Current State */}
      <div className="ads-dark-scale-current">
        <div className="ads-dark-scale-stat">
          <span className="ads-dark-scale-stat-label">Monthly Revenue</span>
          <span className="ads-dark-scale-stat-value">{fmtCurrency(current.monthlyRev)}</span>
        </div>
        <div className="ads-dark-scale-stat">
          <span className="ads-dark-scale-stat-label">Monthly Spend</span>
          <span className="ads-dark-scale-stat-value">{fmtCurrency(current.monthlySpend)}</span>
        </div>
        <div className="ads-dark-scale-stat">
          <span className="ads-dark-scale-stat-label">MER</span>
          <span className="ads-dark-scale-stat-value" style={{ color: merColour(current.mer) }}>
            {current.mer ? current.mer.toFixed(2) + 'x' : '--'}
          </span>
        </div>
        <div className="ads-dark-scale-stat">
          <span className="ads-dark-scale-stat-label">Daily Spend</span>
          <span className="ads-dark-scale-stat-value">{fmtCurrency(current.dailySpend)}</span>
        </div>
      </div>

      {/* Targets */}
      <div className="ads-dark-scale-targets">
        <div className="ads-dark-scale-target-card">
          <h4 className="ads-dark-scale-target-title">Path to $1M/year</h4>
          <div className="ads-dark-scale-target-body">
            <div>Daily revenue needed: <strong>{fmtCurrency(dailyRevNeeded1M)}</strong></div>
            <div>Daily spend needed: <strong style={{ color: dailySpendFor1M ? COLOURS.blue : COLOURS.muted }}>{dailySpendFor1M ? fmtCurrency(dailySpendFor1M) : '--'}</strong></div>
            <div>Gap from current: <strong style={{ color: COLOURS.yellow }}>
              {dailySpendFor1M && current.dailySpend ? fmtCurrency(dailySpendFor1M - current.dailySpend) + '/day' : '--'}
            </strong></div>
          </div>
        </div>

        <div className="ads-dark-scale-target-card">
          <h4 className="ads-dark-scale-target-title">Path to $2M/year</h4>
          <div className="ads-dark-scale-target-body">
            <div>Daily revenue needed: <strong>{fmtCurrency(dailyRevNeeded2M)}</strong></div>
            <div>Daily spend needed: <strong style={{ color: dailySpendFor2M ? COLOURS.blue : COLOURS.muted }}>{dailySpendFor2M ? fmtCurrency(dailySpendFor2M) : '--'}</strong></div>
            <div>Gap from current: <strong style={{ color: COLOURS.yellow }}>
              {dailySpendFor2M && current.dailySpend ? fmtCurrency(dailySpendFor2M - current.dailySpend) + '/day' : '--'}
            </strong></div>
          </div>
        </div>
      </div>

      {/* Custom targets from API */}
      {targets.length > 0 && (
        <div className="ads-dark-scale-steps">
          <h4 className="ads-dark-subsection-title">Scaling Steps</h4>
          {targets.map((t, i) => (
            <div key={i} className="ads-dark-scale-step">
              <span className="ads-dark-scale-step-num">{i + 1}</span>
              <div className="ads-dark-scale-step-info">
                <div>{t.label || `Step ${i + 1}`}</div>
                {t.dailySpend && <span>Daily spend: {fmtCurrency(t.dailySpend)}</span>}
                {t.expectedRevenue && <span>Expected revenue: {fmtCurrency(t.expectedRevenue)}</span>}
                {t.expectedMer && <span>Expected MER: {t.expectedMer.toFixed(1)}x</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Setup Screen ────────────────────────────────────────────────────────────

function SetupScreen() {
  return (
    <div className="ads-dark" style={{ padding: 40 }}>
      <div className="ads-dark-card" style={{ maxWidth: 600, margin: '0 auto', padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>--</div>
        <h2 style={{ color: COLOURS.text, marginBottom: 12 }}>Meta Ads Not Connected</h2>
        <p style={{ color: COLOURS.muted, marginBottom: 24, lineHeight: 1.6 }}>
          To use the Ads Command Centre, you need to configure your Meta (Facebook) Ads API credentials
          in the server environment variables.
        </p>
        <div style={{ textAlign: 'left', background: COLOURS.bg, padding: 20, borderRadius: 8, border: `1px solid ${COLOURS.border}` }}>
          <p style={{ color: COLOURS.muted, fontSize: 13, marginBottom: 12 }}>Required environment variables:</p>
          <code style={{ color: COLOURS.pink, fontSize: 13, display: 'block', lineHeight: 1.8 }}>
            META_ACCESS_TOKEN=your_token<br />
            META_AD_ACCOUNT_ID=act_123456<br />
            META_APP_ID=your_app_id<br />
            META_APP_SECRET=your_app_secret
          </code>
        </div>
      </div>
    </div>
  )
}

// ── Stale Data Banner ───────────────────────────────────────────────────────

function StaleBanner() {
  return (
    <div className="ads-dark-stale-banner">
      Showing cached data. Live connection unavailable. Some figures may be out of date.
    </div>
  )
}

// ── Account Health Check Modal ──────────────────────────────────────────────

function AccountHealthModal({ data, loading, onClose }) {
  if (!data && !loading) return null

  return (
    <div className="ads-dark-overlay" onClick={onClose}>
      <div className="ads-dark-modal ads-dark-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="ads-dark-modal-header">
          <h3 className="ads-dark-modal-title">Account Health Check</h3>
          <button className="ads-dark-btn-icon" onClick={onClose}>X</button>
        </div>

        {loading ? (
          <div style={{ padding: 40 }}>
            <SectionSkeleton rows={4} />
          </div>
        ) : data ? (
          <div className="ads-dark-health-modal-body">
            {/* Score */}
            {data.healthScore != null && (
              <div className="ads-dark-health-score-hero">
                <div className="ads-dark-health-score-circle" style={{
                  borderColor: data.healthScore >= 75 ? COLOURS.green : data.healthScore >= 50 ? COLOURS.yellow : COLOURS.red
                }}>
                  <span className="ads-dark-health-score-num" style={{
                    color: data.healthScore >= 75 ? COLOURS.green : data.healthScore >= 50 ? COLOURS.yellow : COLOURS.red
                  }}>
                    {data.healthScore}
                  </span>
                  <span className="ads-dark-health-score-label">/ 100</span>
                </div>
                <div>
                  <span className="ads-dark-health-status" style={{
                    color: data.healthScore >= 75 ? COLOURS.green : data.healthScore >= 50 ? COLOURS.yellow : COLOURS.red
                  }}>
                    {data.overallHealth?.replace('_', ' ') || 'Unknown'}
                  </span>
                  <p style={{ color: COLOURS.muted, marginTop: 8, lineHeight: 1.5 }}>{data.summary}</p>
                </div>
              </div>
            )}

            {/* Wins */}
            {data.topWins?.length > 0 && (
              <div className="ads-dark-health-section">
                <h4 style={{ color: COLOURS.green, marginBottom: 12 }}>What is Working</h4>
                {data.topWins.map((w, i) => (
                  <div key={i} className="ads-dark-health-item">
                    <strong>{w.ad}</strong> <span style={{ color: COLOURS.muted }}>({w.campaign})</span>
                    <p style={{ color: COLOURS.muted, marginTop: 4 }}>{w.why}</p>
                    <p style={{ color: COLOURS.blue, marginTop: 4 }}>{w.action}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Problems */}
            {data.problems?.length > 0 && (
              <div className="ads-dark-health-section">
                <h4 style={{ color: COLOURS.red, marginBottom: 12 }}>Problems to Fix</h4>
                {data.problems.map((p, i) => (
                  <div key={i} className="ads-dark-health-item">
                    <strong>{p.ad}</strong> <span style={{ color: COLOURS.muted }}>({p.campaign})</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: p.severity === 'HIGH' ? COLOURS.red : COLOURS.yellow }}>
                      {p.severity}
                    </span>
                    <p style={{ color: COLOURS.muted, marginTop: 4 }}>{p.issue}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Next Moves */}
            {data.nextMoves?.length > 0 && (
              <div className="ads-dark-health-section">
                <h4 style={{ color: COLOURS.blue, marginBottom: 12 }}>Next Moves</h4>
                {data.nextMoves.sort((a, b) => a.priority - b.priority).map((m, i) => (
                  <div key={i} className="ads-dark-health-item">
                    <span style={{ color: COLOURS.pink, fontWeight: 700, marginRight: 8 }}>#{m.priority}</span>
                    <strong>{m.action}</strong>
                    <p style={{ color: COLOURS.muted, marginTop: 4 }}>{m.why}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Budget Advice */}
            {data.budgetAdvice && (
              <div className="ads-dark-health-section">
                <h4 style={{ color: COLOURS.yellow, marginBottom: 12 }}>Budget Advice</h4>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ color: COLOURS.muted }}>Current: <strong style={{ color: COLOURS.text }}>${data.budgetAdvice.currentDaily}/day</strong></span>
                  <span style={{ color: COLOURS.muted }}>-&gt;</span>
                  <span style={{ color: COLOURS.green }}>Recommended: <strong>${data.budgetAdvice.recommendedDaily}/day</strong></span>
                </div>
                <p style={{ color: COLOURS.muted }}>{data.budgetAdvice.reasoning}</p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function AdsPerformanceTab() {
  // Core state
  const [dateRange, setDateRange] = useState('7d')
  const [perfData, setPerfData] = useState(null)
  const [perfLoading, setPerfLoading] = useState(true)
  const [perfError, setPerfError] = useState(null)
  const [lastSynced, setLastSynced] = useState(null)
  const [staleData, setStaleData] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)

  // Truth metrics
  const [truth, setTruth] = useState(null)
  const [truthLoading, setTruthLoading] = useState(true)

  // Profitability dashboard (nCAC framework)
  const [profitability, setProfitability] = useState(null)
  const [profLoading, setProfLoading] = useState(true)

  // Daily breakdown
  const [breakdown, setBreakdown] = useState([])
  const [breakdownLoading, setBreakdownLoading] = useState(true)

  // Scale path
  const [scalePath, setScalePath] = useState(null)
  const [scaleLoading, setScaleLoading] = useState(true)

  // AI recommendations
  const [aiRec, setAiRec] = useState(null)
  const [aiRecLoading, setAiRecLoading] = useState(false)
  const [verdicts, setVerdicts] = useState({})

  // Health check
  const [healthData, setHealthData] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)

  // UI state
  const [alerts, setAlerts] = useState([])
  const [showDefinitions, setShowDefinitions] = useState(false)

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const fetchPerformance = useCallback(async (range) => {
    setPerfLoading(true)
    setPerfError(null)
    try {
      const res = await fetch(`${API}/performance?dateRange=${range || dateRange}`)
      const json = await res.json()
      if (!json.ok) {
        if (json.error?.includes('not configured') || json.error?.includes('credentials')) {
          setNotConfigured(true)
          return
        }
        throw new Error(json.error || 'Failed to load performance data')
      }
      setPerfData(json)
      setLastSynced(json.lastSynced)
      setStaleData(false)

      // Generate alerts from campaign data
      const newAlerts = []
      const campaigns = json.campaigns || []
      for (const c of campaigns) {
        if (c.healthScore != null && c.healthScore < 20) {
          newAlerts.push({ severity: 'CRITICAL', message: `"${c.name}" health score is ${c.healthScore}. Consider pausing.`, campaignId: c.id })
        }
        const ins = c.insights || {}
        const cpp = ins.purchases > 0 ? ins.spend / ins.purchases : null
        if (cpp && cpp > GRI.breakevenCPP * 1.5) {
          newAlerts.push({ severity: 'HIGH', message: `"${c.name}" CPP is ${fmtCurrency(cpp)} - well above breakeven.`, campaignId: c.id })
        }
        for (const ad of c.ads || []) {
          if (ad.fatigue?.status === 'DEAD') {
            newAlerts.push({ severity: 'HIGH', message: `Ad "${ad.name}" is fatigued (DEAD). Pause or refresh creative.`, adId: ad.id })
          }
        }
      }
      setAlerts(newAlerts)
    } catch (err) {
      setPerfError(err.message)
      if (perfData) setStaleData(true)
    }
    setPerfLoading(false)
  }, [dateRange])

  const fetchTruth = useCallback(async (range) => {
    setTruthLoading(true)
    try {
      const res = await fetch(`${API}/truth-metrics?dateRange=${range || dateRange}`)
      const json = await res.json()
      if (json.ok) setTruth(json.truth)
    } catch (err) {
      console.error('Truth metrics error:', err)
    }
    setTruthLoading(false)
  }, [dateRange])

  const fetchProfitability = useCallback(async (range) => {
    setProfLoading(true)
    try {
      const res = await fetch(`${API}/profitability-metrics?dateRange=${range || dateRange}`)
      const json = await res.json()
      if (json.ok && json.profitability) {
        const p = json.profitability
        setProfitability(p)
        // Framework alerts
        const frameworkAlerts = []
        if (p.layer1?.cm < 0) {
          frameworkAlerts.push({ severity: 'CRITICAL', message: `CM$ is negative (${fmtCurrency(p.layer1.cm)}). You are losing money. Fix before scaling.` })
        }
        if (p.layer3?.fovCacStatus === 'red') {
          frameworkAlerts.push({ severity: 'CRITICAL', message: `FOV/CAC is ${p.layer3.fovCac?.toFixed(2)}x — underwater on first order. nCAC is too high or AOV too low.` })
        }
        if (p.layer3?.ncacStatus === 'red') {
          frameworkAlerts.push({ severity: 'HIGH', message: `nCAC is ${fmtCurrency(p.layer3.ncac)} — 2x above baseline. Acquisition cost is critical.` })
        }
        if (p.layer3?.newCustWowChange < -20) {
          frameworkAlerts.push({ severity: 'HIGH', message: `New customers down ${Math.abs(p.layer3.newCustWowChange)}% WoW. Acquisition stall detected.` })
        }
        if (frameworkAlerts.length > 0) {
          setAlerts(prev => [...frameworkAlerts, ...prev])
        }
      }
    } catch (err) {
      console.error('Profitability metrics error:', err)
    }
    setProfLoading(false)
  }, [dateRange])

  const fetchBreakdown = useCallback(async () => {
    setBreakdownLoading(true)
    try {
      const days = dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : dateRange === '14d' ? 14 : 30
      const res = await fetch(`${API}/daily-breakdown?days=${days}`)
      const json = await res.json()
      if (json.ok) setBreakdown(json.breakdown || [])
    } catch (err) {
      console.error('Breakdown error:', err)
    }
    setBreakdownLoading(false)
  }, [dateRange])

  const fetchScalePath = useCallback(async () => {
    setScaleLoading(true)
    try {
      const res = await fetch(`${API}/scale-path`)
      const json = await res.json()
      if (json.ok) setScalePath(json)
    } catch (err) {
      console.error('Scale path error:', err)
    }
    setScaleLoading(false)
  }, [])

  const fetchAccountRec = useCallback(async () => {
    setAiRecLoading(true)
    try {
      const res = await fetch(`${API}/account-recommendation`, { method: 'POST' })
      const json = await res.json()
      if (json.ok) setAiRec(json)
    } catch (err) {
      console.error('Account rec error:', err)
    }
    setAiRecLoading(false)
  }, [])

  const fetchHealthCheck = useCallback(async () => {
    setHealthLoading(true)
    setHealthOpen(true)
    try {
      const res = await fetch('/api/ads/strategist/health-check')
      const json = await res.json()
      if (json.ok) setHealthData(json)
    } catch (err) {
      console.error('Health check error:', err)
    }
    setHealthLoading(false)
  }, [])

  const requestVerdict = useCallback(async (campaign) => {
    try {
      const shopifyData = truth ? {
        revenue: truth.shopifyRevenue,
        orders: truth.shopifyOrders,
        aov: truth.shopifyAov
      } : {}
      const res = await fetch(`${API}/recommendation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignData: campaign, shopifyData, dateRange })
      })
      const json = await res.json()
      if (json.ok) {
        setVerdicts(prev => ({ ...prev, [campaign.id]: json }))
      }
    } catch (err) {
      console.error('Verdict error:', err)
    }
  }, [truth, dateRange])

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchPerformance()
    fetchTruth()
    fetchProfitability()
    fetchBreakdown()
  }, [dateRange])

  useEffect(() => {
    fetchScalePath()
    // Try to load cached AI rec
    const cached = sessionStorage.getItem('ads-ai-rec')
    if (cached) {
      try { setAiRec(JSON.parse(cached)) } catch {}
    }
  }, [])

  // Cache AI recs
  useEffect(() => {
    if (aiRec) sessionStorage.setItem('ads-ai-rec', JSON.stringify(aiRec))
  }, [aiRec])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const iv = setInterval(() => {
      fetchPerformance()
      fetchTruth()
      fetchProfitability()
    }, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [fetchPerformance, fetchTruth, fetchProfitability])

  const refreshAll = useCallback(() => {
    fetchPerformance()
    fetchTruth()
    fetchProfitability()
    fetchBreakdown()
    fetchScalePath()
  }, [fetchPerformance, fetchTruth, fetchProfitability, fetchBreakdown, fetchScalePath])

  // ── Derived Data ──────────────────────────────────────────────────────────

  const campaigns = perfData?.campaigns || []

  // ── Not Configured ────────────────────────────────────────────────────────

  if (notConfigured) return <SetupScreen />

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ads-dark">
      {/* Command Bar */}
      <CommandBar
        dateRange={dateRange}
        onDateChange={setDateRange}
        lastSynced={lastSynced}
        onRefresh={refreshAll}
        refreshing={perfLoading}
        onHealthCheck={fetchHealthCheck}
        healthCheckLoading={healthLoading}
        onShowDefinitions={() => setShowDefinitions(true)}
      />

      {/* Stale Data Banner */}
      {staleData && <StaleBanner />}

      {/* Error */}
      {perfError && !staleData && (
        <div className="ads-dark-error-bar">
          <span>{perfError}</span>
          <button className="ads-dark-btn ads-dark-btn-ghost" onClick={() => fetchPerformance()}>Retry</button>
        </div>
      )}

      {/* Alerts */}
      <AlertBar
        alerts={alerts}
        onDismiss={(idx) => setAlerts(prev => prev.filter((_, i) => i !== idx))}
      />

      {/* Profitability Dashboard (nCAC Framework) */}
      <ProfitabilityDashboard profitability={profitability} loading={profLoading} />

      {/* Spend vs Revenue Chart */}
      <SpendChart breakdown={breakdown} loading={breakdownLoading} />

      {/* Campaign Table */}
      <CampaignTable
        campaigns={campaigns}
        loading={perfLoading && !perfData}
        verdicts={verdicts}
        onRequestVerdict={requestVerdict}
        refreshData={refreshAll}
      />

      {/* AI Recommendations */}
      <AIRecommendations
        loading={aiRecLoading}
        recommendations={aiRec}
        onRefresh={fetchAccountRec}
        verdicts={verdicts}
      />

      {/* Scale Path Calculator */}
      <ScalePathCalc scalePath={scalePath} loading={scaleLoading} />

      {/* Modals */}
      {showDefinitions && <MetricDefinitions onClose={() => setShowDefinitions(false)} />}
      {healthOpen && (
        <AccountHealthModal
          data={healthData}
          loading={healthLoading}
          onClose={() => setHealthOpen(false)}
        />
      )}
    </div>
  )
}
