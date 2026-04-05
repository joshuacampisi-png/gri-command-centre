import { useState, useEffect, useCallback, useMemo } from 'react'

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
  const [activeTab, setActiveTab]   = useState('actions')
  const [status, setStatus]         = useState(null)
  const [recs, setRecs]             = useState([])
  const [briefing, setBriefing]     = useState(null)
  const [audit, setAudit]           = useState([])
  const [config, setConfig]         = useState(null)
  const [summary, setSummary]       = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [toast, setToast]           = useState(null)

  // filter state
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [sortBy, setSortBy]                 = useState('impact')
  const [search, setSearch]                 = useState('')

  const fetchAll = useCallback(async () => {
    try {
      const [s, r, b, a, cfg, sm] = await Promise.all([
        fetch(`${API}/status`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/recommendations?status=pending`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/briefing`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/audit?limit=100`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/config`).then(x => x.json()).catch(() => ({})),
        fetch(`${API}/account-summary`).then(x => x.json()).catch(() => null),
      ])
      if (s?.ok) setStatus(s)
      if (r?.ok) setRecs(r.recommendations || [])
      if (b?.ok) setBriefing(b.briefing)
      if (a?.ok) setAudit(a.events || [])
      if (cfg?.ok) setConfig(cfg.config)
      if (sm?.ok) setSummary(sm.summary)
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
        const dry = res.executionResult?.dryRun ? ' · dry-run' : ''
        showToast('ok', `Approved and executed${dry}`)
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

  // Filtered + sorted recommendations
  const filteredRecs = useMemo(() => {
    let out = [...recs]
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
  }, [recs, filterSeverity, filterCategory, sortBy, search])

  // Tally counts for filter badges
  const severityCounts = useMemo(() => {
    const c = { all: recs.length, critical: 0, high: 0, medium: 0, low: 0 }
    for (const r of recs) c[r.severity] = (c[r.severity] || 0) + 1
    return c
  }, [recs])

  const categoryCounts = useMemo(() => {
    const c = { all: recs.length, spend: 0, keyword: 0, bid: 0, quality: 0, merchant: 0 }
    for (const r of recs) c[r.category] = (c[r.category] || 0) + 1
    return c
  }, [recs])

  const totalPotential = useMemo(() => {
    return recs.reduce((sum, r) => sum + (Number(r.projectedDollarImpact) || 0), 0)
  }, [recs])

  const TABS = [
    { key: 'actions',  label: 'Actions',  count: recs.length },
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
              {status?.dryRun && <span className="gads-drychip">Dry-Run</span>}
            </div>
            <h1 className="gads-title">Google Ads Agent</h1>
            <div className="gads-subtitle">
              <span>Gender Reveal Ideas</span>
              <span className="gads-sep">·</span>
              <span>Autonomous optimisation</span>
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
          {recs.length > 0 && (
            <div className="gads-potential">
              <div className="gads-potential-label">Potential monthly impact</div>
              <div className="gads-potential-value">{fmtAud(totalPotential)}</div>
              <div className="gads-potential-sub">{recs.length} open actions</div>
            </div>
          )}
          <button
            className="gads-scan-btn"
            onClick={triggerScan}
            disabled={isScanning || !status?.configured}
          >
            <span className="gads-scan-btn-icon">{isScanning ? '◐' : '⟳'}</span>
            <span>{isScanning ? 'Scanning account...' : 'Run Scan Now'}</span>
          </button>
        </div>
      </header>

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
        {activeTab === 'actions' && (
          <ActionsPanel
            recs={filteredRecs}
            allCount={recs.length}
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
}) {
  if (allCount === 0) {
    return (
      <div className="gads-empty">
        <div className="gads-empty-mark">○</div>
        <div className="gads-empty-title">No recommendations yet</div>
        <div className="gads-empty-sub">Run a scan to check the account for optimisation opportunities.</div>
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
        Showing <strong>{recs.length}</strong> of {allCount} recommendations
      </div>

      {/* Card grid */}
      {recs.length === 0 ? (
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RecommendationCard({ rec, index, onApprove, onDismiss, dryRun }) {
  const [expanded, setExpanded] = useState(false)
  const [approving, setApproving] = useState(false)
  const sev = SEVERITY[rec.severity] || SEVERITY.low
  const cat = CATEGORY[rec.category] || CATEGORY.keyword
  const direction = rec.projectedImpactDirection
  const impactColour = direction === 'save' ? G.green : G.blue
  const impactLabel  = direction === 'save' ? 'potential monthly saving' : 'potential monthly revenue'

  async function handleApprove() {
    setApproving(true)
    await onApprove(rec.id)
    setApproving(false)
  }

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
          <span className="gads-entity">{rec.entityName}</span>
        </div>

        <div className="gads-impact" style={{ color: impactColour }}>
          <div className="gads-impact-num">{fmtAud(rec.projectedDollarImpact)}</div>
          <div className="gads-impact-label">{impactLabel}</div>
        </div>
      </div>

      <h3 className="gads-issue">{rec.issueTitle}</h3>

      <div className="gads-card-body">
        <div className="gads-pillar">
          <div className="gads-pillar-label">What to fix</div>
          <div className="gads-pillar-text">{rec.whatToFix}</div>
        </div>
        <div className="gads-pillar">
          <div className="gads-pillar-label">Why it should change</div>
          <div className="gads-pillar-text muted">{rec.whyItShouldChange}</div>
        </div>
      </div>

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
            <div className="gads-ref-label">Proposed change</div>
            <pre className="gads-ref-code">{JSON.stringify(rec.proposedChange, null, 2)}</pre>
          </div>
        </div>
      </div>

      <div className="gads-card-actions">
        <button className="gads-btn gads-btn-primary" onClick={handleApprove} disabled={approving}>
          <span className="gads-btn-glyph">✓</span>
          {approving ? 'Executing...' : (dryRun ? 'Approve (dry-run)' : 'Approve & Execute')}
        </button>
        <button className="gads-btn gads-btn-ghost" onClick={() => onDismiss(rec.id)}>
          Dismiss
        </button>
        <button className="gads-btn gads-btn-link" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide detail' : 'More detail'}
          <span className={`gads-chevron ${expanded ? 'open' : ''}`}>▾</span>
        </button>
      </div>
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
  margin: 0 0 16px 0;
  letter-spacing: -0.01em;
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
