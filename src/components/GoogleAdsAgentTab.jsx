import { useState, useEffect, useCallback, useMemo } from 'react'
import { GoogleAdsApprovalModal } from './GoogleAdsApprovalModal'

// ═══════════════════════════════════════════════════════════════════════════
//  Google Ads Agent — Command Deck × Google Editorial
//  Typography: Fraunces (display) · IBM Plex Sans (body) · JetBrains Mono (data)
// ═══════════════════════════════════════════════════════════════════════════

const API = '/api/gads-agent'

// Google brand palette — used sharply as semantic accents, not decoration
const G = {
  blue:   '#4285F4',
  red:    '#EA4335',
  yellow: '#FBBC04',
  green:  '#34A853',
  violet: '#A142F4',
}

// Severity → Google colour mapping
const SEVERITY = {
  critical: { colour: G.red,    label: 'Critical', glyph: '◆' },
  high:     { colour: G.yellow, label: 'High',     glyph: '▲' },
  medium:   { colour: G.blue,   label: 'Medium',   glyph: '■' },
  low:      { colour: '#8b8f9c', label: 'Low',     glyph: '•' },
}

// Category → Google colour mapping
const CATEGORY = {
  spend:    { colour: G.red,    label: 'Spend',    icon: '$' },
  keyword:  { colour: G.blue,   label: 'Keyword',  icon: 'Kw' },
  bid:      { colour: G.green,  label: 'Bid',      icon: '↑' },
  quality:  { colour: G.yellow, label: 'Quality',  icon: '★' },
  merchant: { colour: G.violet, label: 'Merchant', icon: '⎘' },
  revert:   { colour: G.red,    label: 'Revert',   icon: '↺' },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtAud(n, decimals = 0) {
  if (n == null || isNaN(n)) return '$0'
  return '$' + Number(n).toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '0'
  return Number(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })
}

function fmtRelative(iso) {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const s = Math.floor(diff / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  } catch { return '' }
}

function fmtDateTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

// ── Google G logo (official 4-colour SVG) ───────────────────────────────────

function GoogleLogo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Google" role="img">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main component
// ═══════════════════════════════════════════════════════════════════════════

export function GoogleAdsAgentTab() {
  const [activeTab, setActiveTab]   = useState('findings')
  const [status, setStatus]         = useState(null)
  const [recs, setRecs]             = useState([])
  const [briefing, setBriefing]     = useState(null)
  const [audit, setAudit]           = useState([])
  const [config, setConfig]         = useState(null)
  const [summary, setSummary]       = useState(null)
  const [context, setContext]       = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [toast, setToast]           = useState(null)
  const [confirmation, setConfirmation] = useState(null) // post-approval modal payload

  // filter state
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [sortBy, setSortBy]                 = useState('impact')
  const [search, setSearch]                 = useState('')

  const fetchAll = useCallback(async () => {
    try {
      const [s, r, b, a, cfg, sm, ctx] = await Promise.all([
        fetch(`${API}/status`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/recommendations?status=pending`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/briefing`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/audit?limit=100`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/config`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/account-summary`).then(x => x.json()).catch(() => null),
        fetch(`${API}/context`).then(x => x.json()).catch(() => null),
      ])
      if (s?.ok) setStatus(s)
      if (r?.ok) setRecs(r.recommendations || [])
      if (b?.ok) setBriefing(b.briefing)
      if (a?.ok) setAudit(a.events || [])
      if (cfg?.ok) setConfig(cfg.config)
      if (sm?.ok) setSummary(sm.summary)
      if (ctx?.ok) setContext(ctx.context)
    } catch (err) {
      showToast('error', err.message)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  function showToast(type, text) {
    setToast({ type, text, id: Date.now() })
    setTimeout(() => setToast(null), 4000)
  }

  async function triggerScan() {
    setIsScanning(true)
    try {
      const res = await fetch(`${API}/scan`, { method: 'POST' }).then(x => x.json())
      if (res.ok) {
        showToast('ok', `Scan complete — ${res.findings || 0} findings, ${res.newRecommendations || 0} new`)
        await fetchAll()
      } else {
        showToast('error', res.error || 'Scan failed')
      }
    } catch (err) {
      showToast('error', err.message)
    } finally {
      setIsScanning(false)
    }
  }

  async function approve(id) {
    try {
      const res = await fetch(`${API}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId: id }),
      }).then(x => x.json())
      if (res.ok) {
        // Open the rich confirmation modal if the backend returned one.
        // Falls back gracefully to a toast for older payload shapes.
        if (res.confirmation) {
          setConfirmation(res.confirmation)
        } else {
          const dry = res.executionResult?.dryRun ? ' · dry-run' : ''
          showToast('ok', `Approved and executed${dry}`)
        }
        await fetchAll()
      } else {
        showToast('error', res.error || 'Approve failed')
      }
    } catch (err) {
      showToast('error', err.message)
    }
  }

  async function dismiss(id) {
    try {
      await fetch(`${API}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId: id }),
      })
      showToast('info', 'Dismissed')
      await fetchAll()
    } catch (err) {
      showToast('error', err.message)
    }
  }

  async function generateBriefing() {
    showToast('info', 'Generating briefing...')
    try {
      const res = await fetch(`${API}/briefing/generate`, { method: 'POST' }).then(x => x.json())
      if (res.ok) {
        showToast('ok', 'Briefing generated')
        await fetchAll()
      } else {
        showToast('error', res.error || 'Briefing failed')
      }
    } catch (err) {
      showToast('error', err.message)
    }
  }

  async function saveConfig(patch) {
    try {
      const res = await fetch(`${API}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).then(x => x.json())
      if (res.ok) {
        setConfig(res.config)
        showToast('ok', 'Thresholds saved')
      }
    } catch (err) {
      showToast('error', err.message)
    }
  }

  async function runAccuracyCheck() {
    showToast('info', 'Running accuracy check...')
    try {
      const res = await fetch(`${API}/accuracy-check`, { method: 'POST' }).then(x => x.json())
      if (res.ok) {
        showToast('ok', `Checked ${res.checked || 0} · ${res.confirmed || 0} confirmed · ${res.reverted || 0} reverted`)
        await fetchAll()
      }
    } catch (err) {
      showToast('error', err.message)
    }
  }

  // Build a campaign-id -> campaign-context lookup map from the /context endpoint.
  // Every card uses this to show channel, bid strategy, budget, protection level.
  const campaignLookup = useMemo(() => {
    const map = {}
    const auto = context?.auto
    if (!auto) return map
    for (const c of auto.enabledCampaigns || []) map[c.id] = c
    for (const c of auto.pausedCampaigns || [])  map[c.id] = c
    return map
  }, [context])

  // Resolve a recommendation's campaign context from the lookup map
  function getRecCampaign(rec) {
    const cid = rec?.currentValue?.campaignId ||
      (rec?.entityType === 'campaign' ? rec.entityId : null)
    if (!cid) return null
    return campaignLookup[String(cid)] || null
  }

  // Protection level lookup (from declared context) keyed by campaign name
  function getRecProtection(rec) {
    const camp = getRecCampaign(rec)
    if (!camp) return 'execute_freely'
    const levels = context?.declared?.protectionLevels || {}
    return levels[camp.name] || 'execute_freely'
  }

  // Determine if a rec is part of the zero-impression keyword group (for batching)
  function isZeroImpressionKeyword(r) {
    return r.category === 'keyword' &&
      (r.issueTitle || '').toLowerCase().includes('zero impressions')
  }

  // Split recs into headline findings + a grouped batch for zero-impression noise
  const { headlineRecs, zeroImpressionGroup } = useMemo(() => {
    const zi = []
    const headline = []
    for (const r of recs) {
      if (isZeroImpressionKeyword(r)) zi.push(r)
      else headline.push(r)
    }
    // Build a synthetic batch record for the UI
    const group = zi.length > 0 ? {
      isBatch: true,
      id: 'group-zero-impression',
      category: 'keyword',
      severity: 'medium',
      count: zi.length,
      children: zi,
      entityName: zi[0] ? (getRecCampaign(zi[0])?.name || 'Search campaign') : 'Search campaign',
      issueTitle: `${zi.length} keywords have received zero impressions over the full window`,
      whatToFix: 'Review and bulk-pause dead keywords to clean up account structure. None of these are currently consuming spend, but they clutter optimisation and inflate Quality Score calculations.',
      projectedDollarImpact: 0,
      projectedImpactDirection: 'save',
    } : null
    return { headlineRecs: headline, zeroImpressionGroup: group }
  }, [recs, campaignLookup, context])

  // Filtered + sorted recommendations (headline only — group sits separately)
  const filteredRecs = useMemo(() => {
    let out = [...headlineRecs]
    if (filterSeverity !== 'all') out = out.filter(r => r.severity === filterSeverity)
    if (filterCategory !== 'all') out = out.filter(r => r.category === filterCategory)
    if (search.trim()) {
      const s = search.toLowerCase()
      out = out.filter(r =>
        r.issueTitle?.toLowerCase().includes(s) ||
        r.entityName?.toLowerCase().includes(s) ||
        r.whatToFix?.toLowerCase().includes(s)
      )
    }
    if (sortBy === 'impact') {
      out.sort((a, b) => (b.projectedDollarImpact || 0) - (a.projectedDollarImpact || 0))
    } else if (sortBy === 'severity') {
      const order = { critical: 0, high: 1, medium: 2, low: 3 }
      out.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
    } else if (sortBy === 'priority') {
      out.sort((a, b) => (a.priority || 999) - (b.priority || 999))
    }
    return out
  }, [headlineRecs, filterSeverity, filterCategory, sortBy, search])

  // Tally counts for filter badges (headline findings only)
  const severityCounts = useMemo(() => {
    const c = { all: headlineRecs.length, critical: 0, high: 0, medium: 0, low: 0 }
    for (const r of headlineRecs) c[r.severity] = (c[r.severity] || 0) + 1
    return c
  }, [headlineRecs])

  const categoryCounts = useMemo(() => {
    const c = { all: headlineRecs.length, spend: 0, keyword: 0, bid: 0, quality: 0, merchant: 0 }
    for (const r of headlineRecs) c[r.category] = (c[r.category] || 0) + 1
    return c
  }, [headlineRecs])

  // Opportunity pool = sum of dollar impact on headline findings only (noise excluded)
  const totalOpportunity = useMemo(() => {
    return headlineRecs.reduce((sum, r) => sum + (Number(r.projectedDollarImpact) || 0), 0)
  }, [headlineRecs])

  const TABS = [
    { key: 'findings', label: 'Findings', count: headlineRecs.length + (zeroImpressionGroup ? 1 : 0) },
    { key: 'briefing', label: 'Briefing' },
    { key: 'audit',    label: 'Audit' },
    { key: 'settings', label: 'Thresholds' },
  ]

  return (
    <div className="gads-root">
      <style>{styleSheet}</style>

      {/* Atmospheric background */}
      <div className="gads-bg-gradient" />
      <div className="gads-bg-grid" />

      {/* Header */}
      <header className="gads-header">
        <div className="gads-header-left">
          <div className="gads-logo-wrap">
            <GoogleLogo size={44} />
          </div>
          <div>
            <div className="gads-eyebrow">
              <span className={`gads-dot ${status?.configured ? 'live' : 'offline'}`} />
              <span className="gads-eyebrow-text">
                {status?.configured ? 'Agent Live' : 'Not Configured'}
              </span>
              {status?.dryRun && <span className="gads-drychip">Discovery Mode</span>}
            </div>
            <h1 className="gads-title">Google Ads Agent</h1>
            <div className="gads-subtitle">
              <span>Gender Reveal Ideas</span>
              <span className="gads-sep">·</span>
              <span>{context?.auto?.enabledCampaigns?.length || 0} active · {context?.auto?.pausedCampaigns?.length || 0} paused · {context?.auto?.sharedLists?.length || 0} shared lists</span>
              {status?.health?.lastAudit && (
                <>
                  <span className="gads-sep">·</span>
                  <span>Last event {fmtRelative(status.health.lastAudit)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="gads-header-right">
          {totalOpportunity > 0 && (
            <div className="gads-potential">
              <div className="gads-potential-label">Opportunities identified</div>
              <div className="gads-potential-value">{fmtAud(totalOpportunity)}</div>
              <div className="gads-potential-sub">across {headlineRecs.length} finding{headlineRecs.length === 1 ? '' : 's'} · under review</div>
            </div>
          )}
          <button
            className="gads-scan-btn"
            onClick={triggerScan}
            disabled={isScanning || !status?.configured}
          >
            <span className="gads-scan-btn-icon">{isScanning ? '◐' : '⟳'}</span>
            <span>{isScanning ? 'Scanning account...' : 'Run Scan'}</span>
          </button>
        </div>
      </header>

      {/* Framework gap warning — the agent currently only produces Layer 4
          (channel ROAS) findings. nCAC, FOV/CAC, LTGP:nCAC, and true CM$
          are not yet computed from Shopify new-customer data. */}
      <div className="gads-framework-warning">
        <div className="gads-framework-warning-inner">
          <span className="gads-framework-warning-chip">FRAMEWORK GAP</span>
          <div className="gads-framework-warning-text">
            <strong>Layer 4 metrics only.</strong> The agent currently reasons in channel ROAS —
            the easiest but weakest layer of your nCAC / LTGP framework. <strong>nCAC, FOV/CAC,
            LTGP:nCAC, aMER and true CM$</strong> (Net Sales – COGS – shipping – processing – ad spend)
            are <em>not yet wired in</em> because they need Shopify new-customer sync, cohort
            tracking, and Cost of Delivery breakdown. Narrative uses framework vocabulary;
            numbers are still ROAS-based. Treat every finding as a proxy signal, not gospel.
          </div>
        </div>
      </div>

      {/* Discovery-mode banner — sets expectations for the entire tab */}
      {status?.dryRun && (
        <div className="gads-phase-banner">
          <div className="gads-phase-banner-left">
            <span className="gads-phase-chip">PHASE 1</span>
            <div>
              <div className="gads-phase-title">Discovery &amp; Context</div>
              <div className="gads-phase-sub">
                The agent is mapping your account and validating its rules against real data.
                Nothing below will be executed. Review findings to pressure-test the agent&apos;s judgement —
                when you&apos;re confident, switch off Dry-Run in Thresholds to unlock execution.
              </div>
            </div>
          </div>
          <div className="gads-phase-banner-right">
            <div className="gads-phase-stat">
              <div className="gads-phase-stat-num">{context?.auto?.enabledCampaigns?.length || 0}</div>
              <div className="gads-phase-stat-lbl">campaigns scanned</div>
            </div>
            <div className="gads-phase-stat">
              <div className="gads-phase-stat-num">{context?.auto?.sharedLists?.length || 0}</div>
              <div className="gads-phase-stat-lbl">shared lists mapped</div>
            </div>
            <div className="gads-phase-stat">
              <div className="gads-phase-stat-num">{headlineRecs.length}</div>
              <div className="gads-phase-stat-lbl">headline findings</div>
            </div>
          </div>
        </div>
      )}

      {/* Metrics strip */}
      {summary && (
        <section className="gads-metrics">
          <MetricCard label="30d Spend"        value={fmtAud(summary.totalSpendAud)} mono />
          <MetricCard label="30d Conv Value"   value={fmtAud(summary.totalConversionsValueAud)} mono accent={G.green} />
          <MetricCard
            label="ROAS"
            value={`${(summary.roas || 0).toFixed(2)}×`}
            delta={summary.roas >= summary.targetRoas ? 'on target' : `target ${summary.targetRoas}×`}
            deltaColour={summary.roas >= summary.targetRoas ? G.green : G.yellow}
            mono
          />
          <MetricCard label="Conversions"      value={fmtNum(summary.totalConversions)} mono />
          <MetricCard label="Avg CPC"          value={fmtAud(summary.avgCpc, 2)} mono />
          <MetricCard label="Clicks"           value={fmtNum(summary.totalClicks)} mono />
          <MetricCard label="Impressions"      value={fmtNum(summary.totalImpressions)} mono />
          <MetricCard label="Campaigns"        value={summary.activeCampaigns || 0} mono accent={G.blue} />
        </section>
      )}

      {/* Toast */}
      {toast && (
        <div className={`gads-toast gads-toast-${toast.type}`} key={toast.id}>
          {toast.text}
        </div>
      )}

      {/* Tab bar */}
      <nav className="gads-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`gads-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <span>{t.label}</span>
            {t.count > 0 && <span className="gads-tab-count">{t.count}</span>}
          </button>
        ))}
      </nav>

      <div className="gads-panel">
        {activeTab === 'findings' && (
          <ActionsPanel
            recs={filteredRecs}
            allCount={headlineRecs.length}
            severityCounts={severityCounts}
            categoryCounts={categoryCounts}
            filterSeverity={filterSeverity}
            filterCategory={filterCategory}
            sortBy={sortBy}
            search={search}
            onFilterSeverity={setFilterSeverity}
            onFilterCategory={setFilterCategory}
            onSort={setSortBy}
            onSearch={setSearch}
            onApprove={approve}
            onDismiss={dismiss}
            dryRun={status?.dryRun}
            campaignLookup={campaignLookup}
            getRecCampaign={getRecCampaign}
            getRecProtection={getRecProtection}
            zeroImpressionGroup={zeroImpressionGroup}
          />
        )}
        {activeTab === 'briefing' && (
          <BriefingPanel briefing={briefing} onGenerate={generateBriefing} />
        )}
        {activeTab === 'audit' && (
          <AuditPanel audit={audit} onAccuracyCheck={runAccuracyCheck} />
        )}
        {activeTab === 'settings' && config && (
          <SettingsPanel config={config} onSave={saveConfig} />
        )}
      </div>

      {/* Post-approval confirmation modal — renders when an approve click
          succeeds and the backend returns a confirmation payload. Zero
          coupling to the rest of the dashboard, dismisses by itself. */}
      <GoogleAdsApprovalModal
        confirmation={confirmation}
        onClose={() => setConfirmation(null)}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function MetricCard({ label, value, delta, deltaColour, accent, mono }) {
  return (
    <div className="gads-metric">
      <div className="gads-metric-label">{label}</div>
      <div className={`gads-metric-value ${mono ? 'mono' : ''}`} style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {delta && (
        <div className="gads-metric-delta" style={deltaColour ? { color: deltaColour } : undefined}>
          {delta}
        </div>
      )}
    </div>
  )
}

function ActionsPanel({
  recs, allCount, severityCounts, categoryCounts,
  filterSeverity, filterCategory, sortBy, search,
  onFilterSeverity, onFilterCategory, onSort, onSearch,
  onApprove, onDismiss, dryRun,
  campaignLookup, getRecCampaign, getRecProtection, zeroImpressionGroup,
}) {
  if (allCount === 0 && !zeroImpressionGroup) {
    return (
      <div className="gads-empty">
        <div className="gads-empty-mark">○</div>
        <div className="gads-empty-title">No findings yet</div>
        <div className="gads-empty-sub">Run a scan to pressure-test the account against the rules engine.</div>
      </div>
    )
  }

  const sevChips = [
    { key: 'all',      label: 'All',      colour: '#8b8f9c' },
    { key: 'critical', label: 'Critical', colour: G.red },
    { key: 'high',     label: 'High',     colour: G.yellow },
    { key: 'medium',   label: 'Medium',   colour: G.blue },
    { key: 'low',      label: 'Low',      colour: '#8b8f9c' },
  ]

  const catChips = [
    { key: 'all',      label: 'All categories', colour: '#8b8f9c' },
    { key: 'spend',    label: 'Spend',          colour: G.red },
    { key: 'keyword',  label: 'Keyword',        colour: G.blue },
    { key: 'bid',      label: 'Bid',            colour: G.green },
    { key: 'quality',  label: 'Quality',        colour: G.yellow },
    { key: 'merchant', label: 'Merchant',       colour: G.violet },
  ]

  return (
    <div>
      {/* Cumulative tally — the "if you approve all N" big-picture view */}
      <CumulativeTally recs={recs} dryRun={dryRun} />

      {/* Filter bar */}
      <div className="gads-filterbar">
        <div className="gads-chips">
          {sevChips.map(c => {
            const active = filterSeverity === c.key
            const count = severityCounts[c.key] || 0
            return (
              <button
                key={c.key}
                className={`gads-chip ${active ? 'active' : ''}`}
                style={active ? { borderColor: c.colour, color: c.colour, background: `${c.colour}18` } : undefined}
                onClick={() => onFilterSeverity(c.key)}
              >
                {c.label}
                <span className="gads-chip-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="gads-filterbar-right">
          <input
            className="gads-search"
            type="text"
            placeholder="Search findings..."
            value={search}
            onChange={e => onSearch(e.target.value)}
          />
          <select className="gads-sort" value={sortBy} onChange={e => onSort(e.target.value)}>
            <option value="impact">Sort: dollar impact</option>
            <option value="severity">Sort: severity</option>
            <option value="priority">Sort: priority</option>
          </select>
        </div>
      </div>

      <div className="gads-chips" style={{ marginTop: 10 }}>
        {catChips.map(c => {
          const active = filterCategory === c.key
          const count = categoryCounts[c.key] || 0
          return (
            <button
              key={c.key}
              className={`gads-chip sm ${active ? 'active' : ''}`}
              style={active ? { borderColor: c.colour, color: c.colour, background: `${c.colour}18` } : undefined}
              onClick={() => onFilterCategory(c.key)}
            >
              {c.label}
              <span className="gads-chip-count">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Result summary */}
      <div className="gads-result-summary">
        <strong>{recs.length}</strong> headline finding{recs.length === 1 ? '' : 's'}
        {zeroImpressionGroup && (
          <> · <strong>{zeroImpressionGroup.count}</strong> grouped as structural cleanup below</>
        )}
      </div>

      {/* Headline cards */}
      {recs.length === 0 && !zeroImpressionGroup ? (
        <div className="gads-empty small">
          <div className="gads-empty-title">No matches</div>
          <div className="gads-empty-sub">Try clearing the filters.</div>
        </div>
      ) : (
        <div className="gads-cards">
          {recs.map((r, i) => (
            <RecommendationCard
              key={r.id}
              rec={r}
              index={i}
              onApprove={onApprove}
              onDismiss={onDismiss}
              dryRun={dryRun}
              campaign={getRecCampaign(r)}
              protection={getRecProtection(r)}
            />
          ))}

          {zeroImpressionGroup && filterSeverity === 'all' && (filterCategory === 'all' || filterCategory === 'keyword') && (
            <GroupedKeywordCard
              group={zeroImpressionGroup}
              campaign={getRecCampaign(zeroImpressionGroup.children[0])}
              protection={getRecProtection(zeroImpressionGroup.children[0])}
              dryRun={dryRun}
              onApproveChild={onApprove}
              onDismissChild={onDismiss}
            />
          )}
        </div>
      )}
    </div>
  )
}

// Small sub-component: campaign context meta row rendered on every card.
// Shows the 4 things you need to know at a glance: which campaign, channel,
// bidding strategy, daily budget. Protection badge is rendered separately.
function CampaignContextRow({ campaign }) {
  if (!campaign) return null
  return (
    <div className="gads-ctx-row">
      <span className="gads-ctx-item gads-ctx-name">{campaign.name}</span>
      <span className="gads-ctx-sep">·</span>
      <span className="gads-ctx-item">{campaign.channel}</span>
      <span className="gads-ctx-sep">·</span>
      <span className="gads-ctx-item">{campaign.bidStrategy?.replace(/_/g, ' ')}</span>
      {campaign.budgetAud > 0 && (
        <>
          <span className="gads-ctx-sep">·</span>
          <span className="gads-ctx-item">${campaign.budgetAud}/day</span>
        </>
      )}
      {campaign.targetRoas && (
        <>
          <span className="gads-ctx-sep">·</span>
          <span className="gads-ctx-item">target {campaign.targetRoas}×</span>
        </>
      )}
    </div>
  )
}

// Forecast panel — rendered on every card below the pillars.
// Shows the real fixed math: current state, projected state, delta, formula,
// assumptions, and confidence. Transparent so Josh can verify every number.
function ForecastPanel({ forecast }) {
  if (!forecast) return null
  const [expanded, setExpanded] = useState(false)

  const deltaSpend   = forecast.monthly?.spendChangeAud || 0
  const deltaRev     = forecast.monthly?.revenueChangeAud || 0
  const deltaProfit  = forecast.monthly?.netProfitChangeAud || 0
  const netSpend     = forecast.netSpendChangeAud || 0

  const profitColour = deltaProfit > 0 ? G.green : deltaProfit < 0 ? G.red : '#8b8f9c'
  const spendColour  = netSpend > 0 ? G.red : netSpend < 0 ? G.green : '#8b8f9c'

  const confColours = { high: G.green, medium: G.yellow, low: '#8b8f9c' }

  return (
    <div className="gads-forecast">
      <div className="gads-forecast-head" onClick={() => setExpanded(!expanded)}>
        <div className="gads-forecast-label">
          <span className="gads-forecast-icon">∑</span>
          Forecast math
        </div>
        <div className="gads-forecast-stats">
          <div className="gads-forecast-stat">
            <div className="gads-forecast-stat-lbl">Net spend/mo</div>
            <div className="gads-forecast-stat-val mono" style={{ color: spendColour }}>
              {fmtAud(netSpend)}
            </div>
          </div>
          <div className="gads-forecast-stat">
            <div className="gads-forecast-stat-lbl">Revenue Δ/mo</div>
            <div className="gads-forecast-stat-val mono" style={{ color: deltaRev >= 0 ? G.green : G.red }}>
              {deltaRev > 0 ? '+' : ''}{fmtAud(deltaRev)}
            </div>
          </div>
          <div className="gads-forecast-stat">
            <div className="gads-forecast-stat-lbl">Net profit Δ/mo</div>
            <div className="gads-forecast-stat-val mono" style={{ color: profitColour }}>
              {deltaProfit > 0 ? '+' : ''}{fmtAud(deltaProfit)}
            </div>
          </div>
          <div className="gads-forecast-stat">
            <div className="gads-forecast-stat-lbl">Confidence</div>
            <div className="gads-forecast-stat-val" style={{ color: confColours[forecast.confidence] || '#8b8f9c', fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>
              {forecast.confidence}
            </div>
          </div>
          <span className={`gads-chevron ${expanded ? 'open' : ''}`}>▾</span>
        </div>
      </div>

      {expanded && (
        <div className="gads-forecast-body">
          <div className="gads-forecast-formula">{forecast.formula}</div>

          <div className="gads-forecast-table">
            <div className="gads-forecast-table-head">Detail</div>
            <div className="gads-forecast-table-row">
              <div className="gads-forecast-table-lbl">Current (last {forecast.currentState?.period || '30d'})</div>
              <div className="gads-forecast-table-val">
                Spend {fmtAud(forecast.currentState?.spendAud, 2)} · Rev {fmtAud(forecast.currentState?.revenueAud, 2)} · ROAS {forecast.currentState?.roas?.toFixed(2)}×
              </div>
            </div>
            <div className="gads-forecast-table-row">
              <div className="gads-forecast-table-lbl">Projected after change</div>
              <div className="gads-forecast-table-val">
                Spend {fmtAud(forecast.projectedState?.spendAud, 2)} · Rev {fmtAud(forecast.projectedState?.revenueAud, 2)} · ROAS {forecast.projectedState?.roas?.toFixed(2)}×
              </div>
            </div>
            <div className="gads-forecast-table-row">
              <div className="gads-forecast-table-lbl">Delta (monthly)</div>
              <div className="gads-forecast-table-val">
                Spend {fmtAud(deltaSpend)} · Revenue {deltaRev > 0 ? '+' : ''}{fmtAud(deltaRev)} · Net profit {deltaProfit > 0 ? '+' : ''}{fmtAud(deltaProfit)}
              </div>
            </div>
          </div>

          {forecast.assumptions && forecast.assumptions.length > 0 && (
            <div className="gads-forecast-assumptions">
              <div className="gads-forecast-assumptions-label">Assumptions</div>
              <ul className="gads-forecast-assumptions-list">
                {forecast.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          {forecast.confidenceReason && (
            <div className="gads-forecast-confidence">
              <div className="gads-forecast-assumptions-label">Confidence note</div>
              <div className="gads-forecast-confidence-text">{forecast.confidenceReason}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Cumulative tally — "if you approve every pending headline finding,
// here's the combined impact". Sits at the top of the Findings tab
// so Josh sees the big-picture effect before clicking any individual card.
function CumulativeTally({ recs, dryRun }) {
  const tally = useMemo(() => {
    const t = {
      count: 0,
      spendChangeAud: 0,
      revenueChangeAud: 0,
      netProfitChangeAud: 0,
      maxSpendIncrease: 0,
    }
    for (const r of recs) {
      const f = r.forecast
      if (!f) continue
      t.count++
      t.spendChangeAud    += f.monthly?.spendChangeAud    || 0
      t.revenueChangeAud  += f.monthly?.revenueChangeAud  || 0
      t.netProfitChangeAud += f.monthly?.netProfitChangeAud || 0
      if ((f.netSpendChangeAud || 0) > t.maxSpendIncrease) {
        t.maxSpendIncrease = f.netSpendChangeAud
      }
    }
    return t
  }, [recs])

  if (tally.count === 0) return null

  const spendDir = tally.spendChangeAud < -1 ? 'save' : tally.spendChangeAud > 1 ? 'add' : 'neutral'
  const spendColour = spendDir === 'save' ? G.green : spendDir === 'add' ? G.red : '#8b8f9c'

  return (
    <div className="gads-tally">
      <div className="gads-tally-head">
        <div>
          <div className="gads-tally-eyebrow">If you approve all {tally.count} pending findings</div>
          <div className="gads-tally-title">Combined monthly impact</div>
        </div>
        {dryRun && <span className="gads-tally-chip">Dry-run projection</span>}
      </div>
      <div className="gads-tally-grid">
        <div className="gads-tally-metric">
          <div className="gads-tally-lbl">Net spend change</div>
          <div className="gads-tally-val mono" style={{ color: spendColour }}>
            {tally.spendChangeAud > 0 ? '+' : ''}{fmtAud(tally.spendChangeAud)}
          </div>
          <div className="gads-tally-sub">
            {spendDir === 'save' && `${fmtAud(Math.abs(tally.spendChangeAud))} recovered`}
            {spendDir === 'add'  && `${fmtAud(tally.spendChangeAud)} added — week-1 flag should block`}
            {spendDir === 'neutral' && 'zero-sum reallocation'}
          </div>
        </div>
        <div className="gads-tally-metric">
          <div className="gads-tally-lbl">Revenue lift</div>
          <div className="gads-tally-val mono" style={{ color: tally.revenueChangeAud >= 0 ? G.green : G.red }}>
            {tally.revenueChangeAud > 0 ? '+' : ''}{fmtAud(tally.revenueChangeAud)}
          </div>
          <div className="gads-tally-sub">from reallocation to higher-ROAS positions</div>
        </div>
        <div className="gads-tally-metric">
          <div className="gads-tally-lbl">Net profit Δ (47% margin)</div>
          <div className="gads-tally-val mono" style={{ color: tally.netProfitChangeAud >= 0 ? G.green : G.red, fontSize: 32 }}>
            {tally.netProfitChangeAud > 0 ? '+' : ''}{fmtAud(tally.netProfitChangeAud)}
          </div>
          <div className="gads-tally-sub">real bottom line if every forecast holds</div>
        </div>
      </div>
    </div>
  )
}

function ProtectionBadge({ protection }) {
  if (protection === 'execute_freely') return null
  const config = {
    alert_only:  { label: 'Manual review only', colour: G.yellow, glyph: '⚑' },
    never_touch: { label: 'Never touch',        colour: G.red,    glyph: '⊘' },
  }[protection]
  if (!config) return null
  return (
    <span
      className="gads-protection-badge"
      style={{
        borderColor: `${config.colour}55`,
        background: `${config.colour}18`,
        color: config.colour,
      }}
      title={`This campaign is ${protection}. The agent will not auto-execute changes against it.`}
    >
      <span className="gads-protection-glyph">{config.glyph}</span>
      {config.label}
    </span>
  )
}

function RecommendationCard({ rec, index, onApprove, onDismiss, dryRun, campaign, protection }) {
  const [expanded, setExpanded] = useState(false)
  const [approving, setApproving] = useState(false)
  const sev = SEVERITY[rec.severity] || SEVERITY.low
  const cat = CATEGORY[rec.category] || CATEGORY.keyword
  const direction = rec.projectedImpactDirection
  const impactColour = direction === 'save' ? G.green : G.blue
  const impactLabel  = direction === 'save' ? 'potential monthly saving' : 'potential monthly revenue'
  const hasImpact = (rec.projectedDollarImpact || 0) > 0
  const isProtected = protection === 'alert_only' || protection === 'never_touch'

  async function handleApprove() {
    setApproving(true)
    try { await onApprove(rec.id) } finally { setApproving(false) }
  }

  // Honest button copy — tells you exactly what will happen on click
  let approveLabel
  if (approving) approveLabel = 'Recording approval...'
  else if (isProtected) approveLabel = 'Approve (manual in Google Ads)'
  else if (dryRun) approveLabel = 'Approve (audit only, no API call)'
  else approveLabel = 'Approve & Execute'

  return (
    <article
      className="gads-card"
      style={{
        borderLeftColor: sev.colour,
        animationDelay: `${Math.min(index * 40, 600)}ms`,
      }}
    >
      <div className="gads-card-head">
        <div className="gads-card-tags">
          <span className="gads-cat-pill" style={{ background: `${cat.colour}18`, color: cat.colour, borderColor: `${cat.colour}55` }}>
            <span className="gads-cat-icon">{cat.icon}</span>
            {cat.label}
          </span>
          <span className="gads-sev-pill" style={{ color: sev.colour }}>
            <span>{sev.glyph}</span>
            {sev.label}
          </span>
          <ProtectionBadge protection={protection} />
        </div>

        {hasImpact && (
          <div className="gads-impact" style={{ color: impactColour }}>
            <div className="gads-impact-num">{fmtAud(rec.projectedDollarImpact)}</div>
            <div className="gads-impact-label">{impactLabel}</div>
          </div>
        )}
      </div>

      <h3 className="gads-issue">{rec.issueTitle}</h3>

      <CampaignContextRow campaign={campaign} />

      <div className="gads-card-body">
        <div className="gads-pillar">
          <div className="gads-pillar-label">What the agent thinks</div>
          <div className="gads-pillar-text">{rec.whatToFix}</div>
        </div>
        <div className="gads-pillar">
          <div className="gads-pillar-label">Why it flagged this</div>
          <div className="gads-pillar-text muted">{rec.whyItShouldChange}</div>
        </div>
      </div>

      <ForecastPanel forecast={rec.forecast} />

      <div className={`gads-expand ${expanded ? 'open' : ''}`}>
        <div className="gads-expand-inner">
          {rec.bestPracticeSource && (
            <div className="gads-ref">
              <div className="gads-ref-label">Best practice reference</div>
              <div className="gads-ref-summary">{rec.bestPracticeSummary}</div>
              <a className="gads-ref-link" href={rec.bestPracticeSource} target="_blank" rel="noopener noreferrer">
                {rec.bestPracticeSource} ↗
              </a>
            </div>
          )}
          <div className="gads-ref">
            <div className="gads-ref-label">Proposed change (for when execution is enabled)</div>
            <pre className="gads-ref-code">{JSON.stringify(rec.proposedChange, null, 2)}</pre>
          </div>
        </div>
      </div>

      {/* Actions — every card has an explicit Approve button. Dry-run and
          protected campaigns still capture the approval, they just route
          differently (audit log or manual-only flag). */}
      <div className="gads-card-actions">
        <button
          className="gads-btn gads-btn-primary"
          onClick={handleApprove}
          disabled={approving}
          title={
            isProtected
              ? 'Records your approval but routes to manual review (this campaign is protected)'
              : dryRun
                ? 'Records your approval in the audit log. No Google Ads API call until Dry-Run is disabled.'
                : 'Records your approval and executes the Google Ads API mutation immediately.'
          }
        >
          <span className="gads-btn-glyph">✓</span>
          {approveLabel}
        </button>
        <button
          className="gads-btn gads-btn-ghost"
          onClick={() => onDismiss(rec.id)}
          title="Reject this finding — the agent will not take action"
        >
          Dismiss
        </button>
        <button
          className="gads-btn gads-btn-link"
          style={{ marginLeft: 'auto' }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide detail' : 'Show detail'}
          <span className={`gads-chevron ${expanded ? 'open' : ''}`}>▾</span>
        </button>
      </div>

      {dryRun && (
        <div className="gads-discovery-note">
          <strong>Dry-run:</strong> clicking Approve records your decision in the audit log but
          does <strong>not</strong> call the Google Ads API. Switch off Dry-Run in Thresholds when you&apos;re
          ready to start executing approved changes.
          {protection === 'alert_only' && (
            <> This campaign is also flagged <strong>alert-only</strong>, so even when execution is live the agent will route approvals to your manual queue rather than auto-executing.</>
          )}
        </div>
      )}
    </article>
  )
}

// Grouped card for the 100+ zero-impression keyword cleanup.
// Collapses structural noise into one reviewable batch with a batch-approve flow.
function GroupedKeywordCard({ group, campaign, protection, dryRun, onApproveChild, onDismissChild }) {
  const [expanded, setExpanded] = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)
  const [dismissingAll, setDismissingAll] = useState(false)
  const isProtected = protection === 'alert_only' || protection === 'never_touch'

  async function approveAll() {
    const msg = dryRun
      ? `Approve pausing all ${group.count} zero-impression keywords?\n\nDry-run mode: this will record ${group.count} approvals in the audit log. No Google Ads API calls will be made.`
      : `Approve pausing all ${group.count} zero-impression keywords?\n\nThis will execute ${group.count} Google Ads API mutations immediately.`
    if (!confirm(msg)) return
    setApprovingAll(true)
    try {
      for (const child of group.children) {
        await onApproveChild(child.id)
      }
    } finally { setApprovingAll(false) }
  }

  async function dismissAll() {
    if (!confirm(`Dismiss all ${group.count} zero-impression keywords? The agent will stop flagging them.`)) return
    setDismissingAll(true)
    try {
      for (const child of group.children) {
        await onDismissChild(child.id)
      }
    } finally { setDismissingAll(false) }
  }

  let approveLabel
  if (approvingAll) approveLabel = `Recording ${group.count} approvals...`
  else if (isProtected) approveLabel = `Approve all ${group.count} (manual in Google Ads)`
  else if (dryRun) approveLabel = `Approve all ${group.count} (audit only)`
  else approveLabel = `Approve & Pause All ${group.count}`

  return (
    <article className="gads-card gads-card-group">
      <div className="gads-card-head">
        <div className="gads-card-tags">
          <span className="gads-cat-pill" style={{ background: `${G.blue}18`, color: G.blue, borderColor: `${G.blue}55` }}>
            <span className="gads-cat-icon">Kw</span>
            Structural
          </span>
          <span className="gads-sev-pill" style={{ color: '#8b8f9c' }}>
            <span>■</span>
            Cleanup
          </span>
          <ProtectionBadge protection={protection} />
          <span className="gads-group-count">{group.count} keywords</span>
        </div>
      </div>

      <h3 className="gads-issue">{group.issueTitle}</h3>

      <CampaignContextRow campaign={campaign} />

      <div className="gads-card-body" style={{ gridTemplateColumns: '1fr' }}>
        <div className="gads-pillar">
          <div className="gads-pillar-label">What the agent thinks</div>
          <div className="gads-pillar-text">{group.whatToFix}</div>
        </div>
      </div>

      <div className={`gads-expand ${expanded ? 'open' : ''}`}>
        <div className="gads-expand-inner">
          <div className="gads-ref-label">All {group.count} keywords in this group</div>
          <div className="gads-group-list">
            {group.children.slice(0, 50).map(c => (
              <div key={c.id} className="gads-group-list-item">
                <span className="gads-group-list-name">{c.entityName}</span>
              </div>
            ))}
            {group.children.length > 50 && (
              <div className="gads-group-list-more">+ {group.children.length - 50} more</div>
            )}
          </div>
        </div>
      </div>

      <div className="gads-card-actions">
        <button
          className="gads-btn gads-btn-primary"
          onClick={approveAll}
          disabled={approvingAll || dismissingAll}
        >
          <span className="gads-btn-glyph">✓</span>
          {approveLabel}
        </button>
        <button
          className="gads-btn gads-btn-ghost"
          onClick={dismissAll}
          disabled={approvingAll || dismissingAll}
        >
          {dismissingAll ? 'Dismissing...' : `Dismiss all ${group.count}`}
        </button>
        <button
          className="gads-btn gads-btn-link"
          style={{ marginLeft: 'auto' }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide keywords' : `Show all ${group.count} keywords`}
          <span className={`gads-chevron ${expanded ? 'open' : ''}`}>▾</span>
        </button>
      </div>

      {dryRun && (
        <div className="gads-discovery-note">
          <strong>Batch approval:</strong> clicking &quot;Approve all&quot; captures {group.count} separate
          approvals in the audit log. In dry-run no API calls are made. When Dry-Run is off,
          this batch-pauses every keyword in the group via the Google Ads API.
        </div>
      )}
    </article>
  )
}

function BriefingPanel({ briefing, onGenerate }) {
  if (!briefing) {
    return (
      <div className="gads-empty">
        <div className="gads-empty-mark">☰</div>
        <div className="gads-empty-title">No briefing generated yet</div>
        <div className="gads-empty-sub">The daily briefing runs at 6am AEST, or generate one now.</div>
        <button className="gads-btn gads-btn-primary" style={{ marginTop: 18 }} onClick={onGenerate}>
          Generate briefing
        </button>
      </div>
    )
  }

  const sections = [
    { key: 'algorithmUpdates',      label: 'Algorithm & Platform Updates', colour: G.blue,   glyph: '◐' },
    { key: 'seasonalOpportunities', label: 'Seasonal Opportunities',       colour: G.green,  glyph: '◑' },
    { key: 'competitorSignals',     label: 'Market Signals',               colour: G.red,    glyph: '◒' },
    { key: 'accountHealthSummary',  label: 'Strategic Guidance',           colour: G.yellow, glyph: '◓' },
  ]

  return (
    <div>
      <div className="gads-briefing-head">
        <div>
          <div className="gads-eyebrow">
            <span className="gads-dot live" />
            <span className="gads-eyebrow-text">Daily Briefing</span>
          </div>
          <h2 className="gads-briefing-title">Intelligence briefing</h2>
          <div className="gads-briefing-date">{fmtDateTime(briefing.createdAt)}</div>
        </div>
        <button className="gads-btn gads-btn-ghost" onClick={onGenerate}>Regenerate</button>
      </div>

      <div className="gads-briefing-grid">
        {sections.map((s, i) => (
          <article
            key={s.key}
            className="gads-briefing-card"
            style={{ animationDelay: `${i * 80}ms`, borderTopColor: s.colour }}
          >
            <div className="gads-briefing-card-head">
              <span className="gads-briefing-glyph" style={{ color: s.colour }}>{s.glyph}</span>
              <span className="gads-briefing-card-label">{s.label}</span>
            </div>
            <p className="gads-briefing-card-text">{briefing[s.key] || 'No updates today.'}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function AuditPanel({ audit, onAccuracyCheck }) {
  const EVENT_COLOURS = {
    scan_started:           G.blue,
    scan_completed:         G.blue,
    recommendation_created: G.yellow,
    approved_and_executed:  G.green,
    dismissed:              '#8b8f9c',
    reverted:               G.red,
    accuracy_check_passed:  G.green,
    accuracy_check_error:   G.red,
    briefing_generated:     G.violet,
    api_ping_ok:            G.green,
    api_ping_failed:        G.red,
    config_updated:         G.blue,
    cron_error:             G.red,
  }

  return (
    <div>
      <div className="gads-audit-head">
        <div>
          <h2 className="gads-briefing-title">Audit log</h2>
          <div className="gads-briefing-date">Every decision, every scan, every revert — recorded here.</div>
        </div>
        <button className="gads-btn gads-btn-ghost" onClick={onAccuracyCheck}>
          Run accuracy check
        </button>
      </div>

      {audit.length === 0 ? (
        <div className="gads-empty small">
          <div className="gads-empty-title">No events yet</div>
        </div>
      ) : (
        <div className="gads-timeline">
          {audit.map((e, i) => {
            const colour = EVENT_COLOURS[e.eventType] || '#8b8f9c'
            return (
              <div key={e.id} className="gads-event" style={{ animationDelay: `${Math.min(i * 15, 400)}ms` }}>
                <div className="gads-event-rail">
                  <div className="gads-event-dot" style={{ background: colour }} />
                  {i < audit.length - 1 && <div className="gads-event-line" />}
                </div>
                <div className="gads-event-body">
                  <div className="gads-event-head">
                    <span className="gads-event-type" style={{ color: colour }}>{e.eventType}</span>
                    <span className="gads-event-by">{e.triggeredBy}</span>
                    <span className="gads-event-time">{fmtDateTime(e.createdAt)}</span>
                  </div>
                  {e.details && Object.keys(e.details).length > 0 && (
                    <pre className="gads-event-detail">{JSON.stringify(e.details, null, 2).slice(0, 400)}</pre>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SettingsPanel({ config, onSave }) {
  const [local, setLocal] = useState(config)
  useEffect(() => setLocal(config), [config])

  const groups = [
    {
      title: 'Execution mode',
      desc: 'Dry-run blocks all real API mutations. Every approval is logged but nothing hits the ad account.',
      fields: [
        { key: 'dryRun', label: 'Dry-run mode', type: 'bool', hint: 'ON = safe. OFF = agent executes real changes on approve.' },
      ],
    },
    {
      title: 'Business constants',
      desc: 'GRI unit economics. Used to project dollar impact on every recommendation.',
      fields: [
        { key: 'avgOrderValueAud', label: 'Average order value (AUD)', type: 'number', step: 0.01 },
        { key: 'grossMarginPct',   label: 'Gross margin (0–1)',        type: 'number', step: 0.01 },
        { key: 'breakevenCppAud',  label: 'Breakeven CPP (AUD)',       type: 'number', step: 0.01 },
        { key: 'targetRoas',       label: 'Target ROAS (×)',           type: 'number', step: 0.1 },
      ],
    },
    {
      title: 'Flag thresholds',
      desc: 'When the rules engine raises a finding. Tune these to balance signal vs noise.',
      fields: [
        { key: 'keywordBleedThresholdAud',  label: 'Keyword bleed threshold (AUD)',  type: 'number' },
        { key: 'campaignBleedThresholdAud', label: 'Campaign bleed threshold (AUD)', type: 'number' },
        { key: 'campaignBleedDays',         label: 'Campaign bleed window (days)',   type: 'number' },
        { key: 'zeroImpressionDays',        label: 'Zero impression cutoff (days)',  type: 'number' },
        { key: 'reallocationLowRoas',       label: 'Reallocation low ROAS',          type: 'number', step: 0.1 },
        { key: 'reallocationHighRoas',      label: 'Reallocation high ROAS',         type: 'number', step: 0.1 },
        { key: 'negativeKwMinClicks',       label: 'Negative keyword min clicks',    type: 'number' },
        { key: 'negativeKwMaxCtr',          label: 'Negative keyword max CTR',       type: 'number', step: 0.001 },
      ],
    },
    {
      title: 'Accuracy & revert',
      desc: 'How long after approval to measure impact, and how much of the projection must materialise to avoid an auto-revert.',
      fields: [
        { key: 'accuracyCheckDays',       label: 'Accuracy check window (days)', type: 'number' },
        { key: 'accuracyMaterialisedPct', label: 'Materialised threshold (0–1)', type: 'number', step: 0.05 },
      ],
    },
  ]

  function update(key, val, type) {
    setLocal(prev => ({ ...prev, [key]: type === 'bool' ? val : Number(val) }))
  }

  const dirty = JSON.stringify(local) !== JSON.stringify(config)

  return (
    <div className="gads-settings">
      {groups.map(group => (
        <section key={group.title} className="gads-group">
          <div className="gads-group-head">
            <h3 className="gads-group-title">{group.title}</h3>
            <p className="gads-group-desc">{group.desc}</p>
          </div>
          <div className="gads-group-fields">
            {group.fields.map(f => (
              <div key={f.key} className={`gads-field ${f.type === 'bool' ? 'bool' : ''}`}>
                <label className="gads-field-label">{f.label}</label>
                {f.type === 'bool' ? (
                  <button
                    className={`gads-toggle ${local?.[f.key] ? 'on' : 'off'}`}
                    onClick={() => update(f.key, !local?.[f.key], 'bool')}
                  >
                    <span className="gads-toggle-knob" />
                    <span className="gads-toggle-label">{local?.[f.key] ? 'ON' : 'OFF'}</span>
                  </button>
                ) : (
                  <input
                    className="gads-input"
                    type="number"
                    value={local?.[f.key] ?? ''}
                    step={f.step || 1}
                    onChange={e => update(f.key, e.target.value, 'number')}
                  />
                )}
                {f.hint && <div className="gads-field-hint">{f.hint}</div>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="gads-settings-footer">
        <button className="gads-btn gads-btn-ghost" onClick={() => setLocal(config)} disabled={!dirty}>
          Reset
        </button>
        <button className="gads-btn gads-btn-primary" onClick={() => onSave(local)} disabled={!dirty}>
          Save thresholds
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  Stylesheet — fonts, CSS vars, animations, hover states
// ═══════════════════════════════════════════════════════════════════════════

const styleSheet = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,900&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

.gads-root {
  --g-blue:    #4285F4;
  --g-red:     #EA4335;
  --g-yellow:  #FBBC04;
  --g-green:   #34A853;
  --g-violet:  #A142F4;

  --bg-base:     #0a0b0f;
  --bg-surface:  #12141a;
  --bg-elevated: #1a1d26;
  --bg-hover:    #1f232d;

  --border:        rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.16);
  --border-hot:    rgba(66,133,244,0.35);

  --text:        #f5f6f8;
  --text-soft:   #d0d3db;
  --text-muted:  #8b8f9c;
  --text-dim:    #5a5e6b;

  --font-display: 'Fraunces', ui-serif, Georgia, serif;
  --font-body:    'IBM Plex Sans', ui-sans-serif, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  position: relative;
  min-height: 100vh;
  background: var(--bg-base);
  color: var(--text);
  font-family: var(--font-body);
  font-feature-settings: 'ss01', 'cv11';
  padding: 0 0 80px 0;
  overflow-x: hidden;
}

/* ── Atmospheric background ─────────────────────────────────────────────── */

.gads-bg-gradient {
  position: absolute;
  top: -200px;
  left: 50%;
  width: 1200px;
  height: 900px;
  transform: translateX(-50%);
  background:
    radial-gradient(ellipse 50% 40% at 20% 30%, rgba(66,133,244,0.10), transparent 60%),
    radial-gradient(ellipse 40% 35% at 80% 20%, rgba(234,67,53,0.07), transparent 60%),
    radial-gradient(ellipse 45% 40% at 50% 70%, rgba(52,168,83,0.05), transparent 60%);
  pointer-events: none;
  z-index: 0;
}

.gads-bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
  background-size: 44px 44px;
  pointer-events: none;
  z-index: 0;
  mask-image: linear-gradient(180deg, black 0%, transparent 800px);
  -webkit-mask-image: linear-gradient(180deg, black 0%, transparent 800px);
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.gads-header {
  position: relative;
  z-index: 1;
  padding: 36px 44px 28px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border);
}

.gads-header-left {
  display: flex;
  gap: 18px;
  align-items: flex-start;
}

.gads-logo-wrap {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
  border: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 1px 0 rgba(255,255,255,0.04) inset,
    0 18px 40px -20px rgba(66,133,244,0.35),
    0 0 0 1px rgba(255,255,255,0.02);
  animation: gads-fade-in 600ms ease-out;
}

.gads-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.gads-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
  position: relative;
}

.gads-dot.live {
  background: var(--g-green);
  box-shadow: 0 0 0 0 rgba(52,168,83,0.5);
  animation: gads-pulse 2.2s ease-out infinite;
}

.gads-dot.offline {
  background: var(--g-red);
}

.gads-eyebrow-text {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.gads-drychip {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.15em;
  padding: 3px 8px;
  border-radius: 3px;
  background: rgba(251,188,4,0.12);
  color: var(--g-yellow);
  border: 1px solid rgba(251,188,4,0.3);
  text-transform: uppercase;
  margin-left: 4px;
}

/* ── Framework gap warning ─────────────────────────────────────────────── */

.gads-framework-warning {
  position: relative;
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(234,67,53,0.10), rgba(251,188,4,0.06) 40%, transparent 70%),
    #0f0b08;
  border-top: 1px solid rgba(234,67,53,0.25);
  border-bottom: 1px solid rgba(234,67,53,0.15);
  padding: 14px 44px;
}

.gads-framework-warning-inner {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  max-width: 1400px;
}

.gads-framework-warning-chip {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  padding: 5px 10px;
  border-radius: 4px;
  background: rgba(234,67,53,0.16);
  color: #ff6b5e;
  border: 1px solid rgba(234,67,53,0.35);
  flex-shrink: 0;
  margin-top: 1px;
  white-space: nowrap;
}

.gads-framework-warning-text {
  font-size: 12.5px;
  line-height: 1.55;
  color: #d0d3db;
}

.gads-framework-warning-text strong {
  color: #f5f6f8;
  font-weight: 600;
}

.gads-framework-warning-text em {
  color: #ff9f95;
  font-style: normal;
  font-weight: 500;
}

/* ── Discovery-mode phase banner ────────────────────────────────────────── */

.gads-phase-banner {
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 20px 44px;
  background:
    linear-gradient(90deg, rgba(66,133,244,0.10), rgba(52,168,83,0.04) 40%, transparent 70%),
    var(--bg-surface);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
}

.gads-phase-banner-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  max-width: 780px;
}

.gads-phase-chip {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  padding: 6px 12px;
  border-radius: 4px;
  background: linear-gradient(180deg, var(--g-blue), #3367d6);
  color: white;
  flex-shrink: 0;
  box-shadow: 0 4px 14px -6px rgba(66,133,244,0.6);
  margin-top: 2px;
}

.gads-phase-title {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 96;
  font-weight: 500;
  font-size: 22px;
  line-height: 1.2;
  color: var(--text);
  letter-spacing: -0.01em;
  margin-bottom: 3px;
}

.gads-phase-sub {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-muted);
  max-width: 680px;
}

.gads-phase-banner-right {
  display: flex;
  gap: 28px;
}

.gads-phase-stat {
  text-align: right;
}

.gads-phase-stat-num {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 144;
  font-weight: 500;
  font-size: 28px;
  line-height: 1;
  color: var(--text);
  letter-spacing: -0.015em;
}

.gads-phase-stat-lbl {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-top: 4px;
}

.gads-title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 44px;
  line-height: 1;
  letter-spacing: -0.02em;
  margin: 2px 0 10px;
  font-variation-settings: 'opsz' 144;
  background: linear-gradient(180deg, #ffffff 0%, #c8ccd6 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.gads-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.gads-sep {
  color: var(--text-dim);
}

.gads-header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.gads-potential {
  text-align: right;
  padding-right: 4px;
}

.gads-potential-label {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.gads-potential-value {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 144;
  font-weight: 500;
  font-size: 34px;
  line-height: 1;
  color: var(--g-green);
  letter-spacing: -0.02em;
}

.gads-potential-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.gads-scan-btn {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 14px;
  padding: 14px 22px;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #e8ebf1 100%);
  color: #0a0b0f;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  box-shadow:
    0 1px 0 rgba(255,255,255,0.5) inset,
    0 12px 32px -12px rgba(255,255,255,0.25);
  transition: transform 120ms ease, box-shadow 200ms ease, opacity 200ms ease;
}

.gads-scan-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 1px 0 rgba(255,255,255,0.5) inset,
    0 20px 40px -14px rgba(66,133,244,0.45);
}

.gads-scan-btn:active:not(:disabled) {
  transform: translateY(0);
}

.gads-scan-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.gads-scan-btn-icon {
  font-size: 16px;
  display: inline-block;
}

.gads-scan-btn:not(:disabled) .gads-scan-btn-icon {
  animation: gads-spin 8s linear infinite;
}

/* ── Metrics strip ──────────────────────────────────────────────────────── */

.gads-metrics {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1px;
  background: var(--border);
  border-bottom: 1px solid var(--border);
}

.gads-metric {
  background: var(--bg-base);
  padding: 20px 22px;
  animation: gads-fade-up 500ms ease-out backwards;
}

.gads-metric:nth-child(1) { animation-delay: 50ms; }
.gads-metric:nth-child(2) { animation-delay: 100ms; }
.gads-metric:nth-child(3) { animation-delay: 150ms; }
.gads-metric:nth-child(4) { animation-delay: 200ms; }
.gads-metric:nth-child(5) { animation-delay: 250ms; }
.gads-metric:nth-child(6) { animation-delay: 300ms; }
.gads-metric:nth-child(7) { animation-delay: 350ms; }
.gads-metric:nth-child(8) { animation-delay: 400ms; }

.gads-metric-label {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.gads-metric-value {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 144;
  font-weight: 500;
  font-size: 26px;
  line-height: 1.1;
  color: var(--text);
  letter-spacing: -0.015em;
}

.gads-metric-value.mono {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.gads-metric-delta {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
  margin-top: 6px;
  letter-spacing: 0.02em;
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */

.gads-tabs {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 2px;
  padding: 0 44px;
  border-bottom: 1px solid var(--border);
  background: rgba(10,11,15,0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.gads-tab {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  padding: 18px 22px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: color 200ms ease;
}

.gads-tab:hover { color: var(--text-soft); }

.gads-tab.active { color: var(--text); }

.gads-tab.active::after {
  content: '';
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, var(--g-blue), var(--g-green));
  border-radius: 2px;
}

.gads-tab-count {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--g-red);
  color: white;
  min-width: 20px;
  text-align: center;
}

/* ── Panel container ────────────────────────────────────────────────────── */

.gads-panel {
  position: relative;
  z-index: 1;
  padding: 28px 44px 0;
}

/* ── Filter bar ─────────────────────────────────────────────────────────── */

.gads-filterbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.gads-filterbar-right {
  display: flex;
  gap: 10px;
  align-items: center;
}

.gads-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gads-chip {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 500;
  padding: 8px 14px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 180ms ease;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.gads-chip.sm {
  font-size: 11px;
  padding: 6px 12px;
}

.gads-chip:hover {
  border-color: var(--border-strong);
  color: var(--text-soft);
}

.gads-chip.active {
  font-weight: 600;
}

.gads-chip-count {
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.7;
  padding-left: 2px;
}

.gads-search {
  font-family: var(--font-body);
  font-size: 13px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  width: 220px;
  transition: border-color 180ms ease;
}

.gads-search:focus {
  outline: none;
  border-color: var(--border-hot);
}

.gads-search::placeholder {
  color: var(--text-dim);
}

.gads-sort {
  font-family: var(--font-body);
  font-size: 13px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
}

.gads-sort:focus {
  outline: none;
  border-color: var(--border-hot);
}

.gads-result-summary {
  margin-top: 20px;
  margin-bottom: 14px;
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}

.gads-result-summary strong {
  color: var(--text);
  font-weight: 600;
}

/* ── Recommendation cards ───────────────────────────────────────────────── */

.gads-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gads-card {
  background: linear-gradient(180deg, var(--bg-surface) 0%, rgba(18,20,26,0.6) 100%);
  border: 1px solid var(--border);
  border-left: 3px solid;
  border-radius: 14px;
  padding: 22px 24px;
  position: relative;
  animation: gads-fade-up 500ms ease-out backwards;
  transition: border-color 220ms ease, transform 220ms ease, box-shadow 300ms ease;
}

.gads-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
  box-shadow: 0 18px 40px -20px rgba(0,0,0,0.6);
}

.gads-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 14px;
}

.gads-card-tags {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.gads-cat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 5px;
  border: 1px solid;
  font-family: var(--font-mono);
}

.gads-cat-icon {
  font-family: var(--font-mono);
  font-weight: 700;
}

.gads-sev-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: var(--font-mono);
}

.gads-entity {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  padding-left: 6px;
  border-left: 1px solid var(--border);
  margin-left: 2px;
}

.gads-impact {
  text-align: right;
  flex-shrink: 0;
}

.gads-impact-num {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 144;
  font-weight: 500;
  font-size: 36px;
  line-height: 1;
  letter-spacing: -0.025em;
}

.gads-impact-label {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  margin-top: 4px;
}

.gads-issue {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 48;
  font-weight: 500;
  font-size: 20px;
  line-height: 1.3;
  color: var(--text);
  margin: 0 0 10px 0;
  letter-spacing: -0.01em;
}

/* ── Campaign context meta row ─────────────────────────────────────────── */

.gads-ctx-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 14px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}

.gads-ctx-item {
  white-space: nowrap;
}

.gads-ctx-name {
  color: var(--text-soft);
  font-weight: 600;
}

.gads-ctx-sep {
  color: var(--text-dim);
  opacity: 0.6;
}

/* ── Protection badge ──────────────────────────────────────────────────── */

.gads-protection-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.gads-protection-glyph {
  font-size: 11px;
  line-height: 1;
}

/* ── Forecast panel (inside card) ──────────────────────────────────────── */

.gads-forecast {
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255,255,255,0.015);
}

.gads-forecast-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  gap: 12px;
  flex-wrap: wrap;
  transition: background 160ms ease;
}

.gads-forecast-head:hover {
  background: rgba(255,255,255,0.03);
}

.gads-forecast-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.gads-forecast-icon {
  font-family: var(--font-display);
  font-size: 16px;
  color: var(--g-blue);
  line-height: 1;
}

.gads-forecast-stats {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
}

.gads-forecast-stat {
  min-width: 72px;
}

.gads-forecast-stat-lbl {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 2px;
}

.gads-forecast-stat-val {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.gads-forecast-stat-val.mono {
  font-family: var(--font-mono);
}

.gads-forecast-body {
  padding: 0 16px 16px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gads-forecast-formula {
  margin-top: 14px;
  padding: 12px 14px;
  background: rgba(66,133,244,0.06);
  border: 1px solid rgba(66,133,244,0.2);
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-soft);
}

.gads-forecast-table {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.gads-forecast-table-head {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 8px 14px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid var(--border);
}

.gads-forecast-table-row {
  display: grid;
  grid-template-columns: 200px 1fr;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.gads-forecast-table-row:last-child {
  border-bottom: none;
}

.gads-forecast-table-lbl {
  font-family: var(--font-mono);
  color: var(--text-muted);
  font-size: 11px;
}

.gads-forecast-table-val {
  color: var(--text-soft);
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.gads-forecast-assumptions,
.gads-forecast-confidence {
  padding: 12px 14px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.gads-forecast-assumptions-label {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.gads-forecast-assumptions-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.55;
}

.gads-forecast-assumptions-list li {
  margin-bottom: 3px;
}

.gads-forecast-confidence-text {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-soft);
  font-style: italic;
}

/* ── Cumulative tally (top of findings tab) ────────────────────────────── */

.gads-tally {
  margin-bottom: 22px;
  padding: 22px 26px;
  background:
    linear-gradient(135deg, rgba(52,168,83,0.08), rgba(66,133,244,0.04) 50%, transparent 80%),
    var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  position: relative;
  overflow: hidden;
}

.gads-tally-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 18px;
}

.gads-tally-eyebrow {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.gads-tally-title {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 96;
  font-weight: 500;
  font-size: 24px;
  letter-spacing: -0.015em;
  color: var(--text);
}

.gads-tally-chip {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.14em;
  padding: 4px 10px;
  border-radius: 4px;
  background: rgba(251,188,4,0.12);
  color: var(--g-yellow);
  border: 1px solid rgba(251,188,4,0.3);
  text-transform: uppercase;
  white-space: nowrap;
}

.gads-tally-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
}

.gads-tally-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gads-tally-lbl {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.gads-tally-val {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 144;
  font-weight: 500;
  font-size: 26px;
  line-height: 1;
  letter-spacing: -0.02em;
}

.gads-tally-val.mono {
  font-family: var(--font-mono);
  font-weight: 500;
  letter-spacing: -0.02em;
}

.gads-tally-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.4;
}

/* ── Discovery-mode note (inside card) ─────────────────────────────────── */

.gads-discovery-note {
  margin-top: 14px;
  padding: 10px 14px;
  background: rgba(66,133,244,0.06);
  border: 1px solid rgba(66,133,244,0.2);
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-muted);
  font-style: italic;
}

.gads-discovery-note strong {
  color: var(--g-yellow);
  font-style: normal;
}

/* ── Grouped keyword card ──────────────────────────────────────────────── */

.gads-card-group {
  border-left-color: #8b8f9c;
  background: linear-gradient(180deg, rgba(139,143,156,0.04) 0%, var(--bg-surface) 100%);
}

.gads-group-count {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(255,255,255,0.05);
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.gads-group-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px 14px;
  margin-top: 8px;
}

.gads-group-list-item {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-soft);
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}

.gads-group-list-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.gads-group-list-more {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  padding-top: 8px;
  grid-column: 1 / -1;
  text-align: center;
}

.gads-card-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 780px) {
  .gads-card-body { grid-template-columns: 1fr; }
}

.gads-pillar-label {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.gads-pillar-text {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text);
}

.gads-pillar-text.muted {
  color: var(--text-soft);
}

.gads-expand {
  max-height: 0;
  overflow: hidden;
  transition: max-height 360ms ease, opacity 280ms ease, margin 280ms ease;
  opacity: 0;
}

.gads-expand.open {
  max-height: 800px;
  opacity: 1;
  margin-top: 16px;
}

.gads-expand-inner {
  padding: 16px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gads-ref-label {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.gads-ref-summary {
  font-size: 12px;
  color: var(--text-soft);
  line-height: 1.55;
  margin-bottom: 6px;
}

.gads-ref-link {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--g-blue);
  word-break: break-all;
  text-decoration: none;
}

.gads-ref-link:hover { text-decoration: underline; }

.gads-ref-code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 10px;
  background: rgba(0,0,0,0.3);
  border-radius: 6px;
}

.gads-card-actions {
  margin-top: 18px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.gads-btn {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 13px;
  padding: 10px 18px;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 180ms ease;
  border: 1px solid transparent;
}

.gads-btn-primary {
  background: linear-gradient(180deg, #ffffff 0%, #e0e4ec 100%);
  color: #0a0b0f;
  font-weight: 600;
  box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 8px 20px -8px rgba(255,255,255,0.2);
}

.gads-btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 14px 30px -10px rgba(52,168,83,0.45);
}

.gads-btn-primary:disabled {
  opacity: 0.5;
  cursor: wait;
}

.gads-btn-glyph {
  font-family: var(--font-mono);
  font-weight: 700;
}

.gads-btn-ghost {
  background: transparent;
  color: var(--text-muted);
  border-color: var(--border);
}

.gads-btn-ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.gads-btn-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.gads-btn-link {
  background: transparent;
  color: var(--text-muted);
  border: none;
  margin-left: auto;
  padding: 10px 8px;
}

.gads-btn-link:hover { color: var(--text); }

.gads-chevron {
  display: inline-block;
  transition: transform 260ms ease;
  font-size: 11px;
}

.gads-chevron.open {
  transform: rotate(180deg);
}

/* ── Briefing ───────────────────────────────────────────────────────────── */

.gads-briefing-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.gads-briefing-title {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 96;
  font-weight: 500;
  font-size: 32px;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 6px 0 4px 0;
  color: var(--text);
}

.gads-briefing-date {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.gads-briefing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 14px;
}

.gads-briefing-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-top: 3px solid;
  border-radius: 12px;
  padding: 22px 24px 24px;
  animation: gads-fade-up 500ms ease-out backwards;
  transition: transform 220ms ease, border-color 220ms ease;
}

.gads-briefing-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
}

.gads-briefing-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.gads-briefing-glyph {
  font-size: 20px;
  font-weight: 700;
}

.gads-briefing-card-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-muted);
}

.gads-briefing-card-text {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 14;
  font-weight: 400;
  font-size: 15px;
  line-height: 1.55;
  color: var(--text-soft);
  margin: 0;
  letter-spacing: -0.005em;
}

/* ── Audit timeline ─────────────────────────────────────────────────────── */

.gads-audit-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 22px;
}

.gads-timeline {
  display: flex;
  flex-direction: column;
}

.gads-event {
  display: flex;
  gap: 16px;
  padding: 14px 0;
  animation: gads-fade-up 400ms ease-out backwards;
}

.gads-event-rail {
  position: relative;
  flex-shrink: 0;
  width: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gads-event-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--bg-base), 0 0 0 4px var(--border);
  margin-top: 4px;
}

.gads-event-line {
  flex: 1;
  width: 1px;
  background: var(--border);
  margin-top: 4px;
}

.gads-event-body {
  flex: 1;
  min-width: 0;
}

.gads-event-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.gads-event-type {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.gads-event-by {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 2px 8px;
  background: var(--bg-surface);
  border-radius: 4px;
  border: 1px solid var(--border);
}

.gads-event-time {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  margin-left: auto;
}

.gads-event-detail {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-muted);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 10px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  max-height: 140px;
  overflow: hidden;
}

/* ── Settings ───────────────────────────────────────────────────────────── */

.gads-settings {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.gads-group {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px 26px;
  animation: gads-fade-up 500ms ease-out backwards;
}

.gads-group-head {
  margin-bottom: 20px;
}

.gads-group-title {
  font-family: var(--font-display);
  font-variation-settings: 'opsz' 72;
  font-weight: 500;
  font-size: 22px;
  line-height: 1.2;
  margin: 0 0 4px 0;
  color: var(--text);
  letter-spacing: -0.015em;
}

.gads-group-desc {
  font-size: 12.5px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.5;
}

.gads-group-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.gads-field {
  display: flex;
  flex-direction: column;
}

.gads-field.bool {
  grid-column: 1 / -1;
}

.gads-field-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.gads-field-hint {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 6px;
  line-height: 1.5;
}

.gads-input {
  font-family: var(--font-mono);
  font-size: 14px;
  padding: 11px 14px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  transition: border-color 180ms ease;
}

.gads-input:focus {
  outline: none;
  border-color: var(--border-hot);
}

.gads-toggle {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px 8px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-base);
  cursor: pointer;
  width: fit-content;
  transition: all 200ms ease;
}

.gads-toggle.on {
  border-color: rgba(251,188,4,0.4);
  background: rgba(251,188,4,0.08);
  color: var(--g-yellow);
}

.gads-toggle.off {
  color: var(--text-muted);
}

.gads-toggle-knob {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: all 240ms ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

.gads-toggle.on .gads-toggle-knob {
  background: var(--g-yellow);
  box-shadow: 0 0 16px rgba(251,188,4,0.4);
}

.gads-settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
}

/* ── Empty state ────────────────────────────────────────────────────────── */

.gads-empty {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-muted);
}

.gads-empty.small {
  padding: 40px 20px;
}

.gads-empty-mark {
  font-size: 40px;
  color: var(--text-dim);
  margin-bottom: 16px;
  font-family: var(--font-display);
}

.gads-empty-title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 20px;
  color: var(--text);
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}

.gads-empty-sub {
  font-size: 13px;
  color: var(--text-muted);
}

/* ── Toast ──────────────────────────────────────────────────────────────── */

.gads-toast {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 100;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  animation: gads-toast-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
  box-shadow: 0 20px 50px -20px rgba(0,0,0,0.6);
}

.gads-toast-ok {
  background: rgba(52,168,83,0.12);
  border: 1px solid rgba(52,168,83,0.4);
  color: var(--g-green);
}

.gads-toast-error {
  background: rgba(234,67,53,0.12);
  border: 1px solid rgba(234,67,53,0.4);
  color: var(--g-red);
}

.gads-toast-info {
  background: rgba(66,133,244,0.12);
  border: 1px solid rgba(66,133,244,0.4);
  color: var(--g-blue);
}

/* ── Keyframes ──────────────────────────────────────────────────────────── */

@keyframes gads-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(52,168,83,0.55); }
  70%  { box-shadow: 0 0 0 10px rgba(52,168,83,0); }
  100% { box-shadow: 0 0 0 0 rgba(52,168,83,0); }
}

@keyframes gads-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes gads-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes gads-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes gads-toast-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Responsive ─────────────────────────────────────────────────────────── */

@media (max-width: 900px) {
  .gads-header, .gads-tabs, .gads-panel { padding-left: 24px; padding-right: 24px; }
  .gads-title { font-size: 34px; }
  .gads-potential-value { font-size: 26px; }
}
`
