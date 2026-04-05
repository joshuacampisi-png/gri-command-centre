import { useState, useEffect, useCallback } from 'react'

// ── Dark Theme Colours (match AdsFlywheelTab) ───────────────────────────────

const C = {
  bg: '#0D1117', card: '#161B22', border: '#30363D',
  text: '#E6EDF3', muted: '#8B949E',
  green: '#3FB950', red: '#F85149', yellow: '#D29922',
  blue: '#58A6FF', pink: '#E43F7B', purple: '#A371F7',
  orange: '#E3651D',
}

const API = '/api/gads-agent'

const CATEGORY_COLOURS = {
  spend:    C.red,
  keyword:  C.orange,
  bid:      C.blue,
  quality:  C.yellow,
  merchant: C.purple,
}

const SEVERITY_COLOURS = {
  critical: C.red,
  high:     C.orange,
  medium:   C.yellow,
  low:      C.muted,
}

function fmt$(n) {
  if (n == null || isNaN(n)) return '$0'
  return '$' + Math.round(Number(n)).toLocaleString('en-AU')
}
function fmt$2(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}

// ── Main component ──────────────────────────────────────────────────────────

export function GoogleAdsAgentTab() {
  const [activeTab, setActiveTab] = useState('actions')
  const [status, setStatus] = useState(null)
  const [recs, setRecs] = useState([])
  const [briefing, setBriefing] = useState(null)
  const [audit, setAudit] = useState([])
  const [config, setConfig] = useState(null)
  const [summary, setSummary] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [msg, setMsg] = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [s, r, b, a, cfg, sm] = await Promise.all([
        fetch(`${API}/status`).then(x => x.json()),
        fetch(`${API}/recommendations?status=pending`).then(x => x.json()),
        fetch(`${API}/briefing`).then(x => x.json()),
        fetch(`${API}/audit?limit=100`).then(x => x.json()),
        fetch(`${API}/config`).then(x => x.json()),
        fetch(`${API}/account-summary`).then(x => x.json()).catch(() => null),
      ])
      if (s.ok) setStatus(s)
      if (r.ok) setRecs(r.recommendations || [])
      if (b.ok) setBriefing(b.briefing)
      if (a.ok) setAudit(a.events || [])
      if (cfg.ok) setConfig(cfg.config)
      if (sm?.ok) setSummary(sm.summary)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function triggerScan() {
    setIsScanning(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/scan`, { method: 'POST' }).then(x => x.json())
      if (res.ok) {
        setMsg({ type: 'ok', text: `Scan complete — ${res.findings || 0} findings, ${res.newRecommendations || 0} new recommendations` })
        await fetchAll()
      } else {
        setMsg({ type: 'error', text: res.error || 'Scan failed' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
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
        const dryNote = res.executionResult?.dryRun ? ' (dry-run — no API mutation sent)' : ''
        setMsg({ type: 'ok', text: `Approved and executed${dryNote}` })
        await fetchAll()
      } else {
        setMsg({ type: 'error', text: res.error || 'Approve failed' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  async function dismiss(id) {
    try {
      await fetch(`${API}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId: id }),
      })
      await fetchAll()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  async function generateBriefing() {
    setMsg({ type: 'info', text: 'Generating intelligence briefing...' })
    try {
      const res = await fetch(`${API}/briefing/generate`, { method: 'POST' }).then(x => x.json())
      if (res.ok) {
        setMsg({ type: 'ok', text: 'Briefing generated' })
        await fetchAll()
      } else {
        setMsg({ type: 'error', text: res.error || 'Briefing failed' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
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
        setMsg({ type: 'ok', text: 'Config saved' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  async function runAccuracyCheck() {
    setMsg({ type: 'info', text: 'Running accuracy check and revert sweep...' })
    try {
      const res = await fetch(`${API}/accuracy-check`, { method: 'POST' }).then(x => x.json())
      if (res.ok) {
        setMsg({ type: 'ok', text: `Accuracy check complete — ${res.checked || 0} checked, ${res.confirmed || 0} confirmed, ${res.reverted || 0} reverted` })
        await fetchAll()
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  const TABS = [
    { key: 'actions',  label: 'Actions', count: recs.length },
    { key: 'briefing', label: 'Intelligence Briefing' },
    { key: 'audit',    label: 'Audit Log' },
    { key: 'settings', label: 'Thresholds' },
  ]

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: '-apple-system, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: status?.configured ? C.green : C.red }} />
            <span style={{ fontSize: 11, color: status?.configured ? C.green : C.red, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
              {status?.configured ? 'Agent Active' : 'Not Configured'}
            </span>
            {status?.dryRun && (
              <span style={{ fontSize: 11, color: C.yellow, background: 'rgba(210,153,34,0.15)', padding: '2px 8px', borderRadius: 4, fontWeight: 600, marginLeft: 8 }}>
                DRY-RUN MODE
              </span>
            )}
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Google Ads Agent</h1>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>GRI — Gender Reveal Ideas</div>
        </div>
        <button
          onClick={triggerScan}
          disabled={isScanning || !status?.configured}
          style={{
            background: C.text, color: C.bg, border: 'none', padding: '10px 18px',
            borderRadius: 6, fontWeight: 600, cursor: isScanning ? 'wait' : 'pointer',
            opacity: isScanning || !status?.configured ? 0.5 : 1,
          }}
        >
          {isScanning ? 'Scanning...' : 'Run Scan Now'}
        </button>
      </div>

      {/* Status bar */}
      {summary && (
        <div style={{ padding: '14px 28px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
          <Metric label="30d Spend"       value={fmt$(summary.totalSpendAud)} />
          <Metric label="30d Conv Value"  value={fmt$(summary.totalConversionsValueAud)} />
          <Metric label="ROAS"            value={`${summary.roas?.toFixed(2) || '0.00'}x`} />
          <Metric label="Conversions"     value={Math.round(summary.totalConversions || 0)} />
          <Metric label="Avg CPC"         value={fmt$2(summary.avgCpc)} />
          <Metric label="Active Campaigns" value={summary.activeCampaigns || 0} />
          <Metric label="Target ROAS"     value={`${summary.targetRoas?.toFixed(1)}x`} />
          <Metric label="Breakeven CPP"   value={fmt$2(summary.breakevenCppAud)} />
        </div>
      )}

      {msg && (
        <div style={{
          margin: '12px 28px', padding: '10px 14px', borderRadius: 6, fontSize: 13,
          background: msg.type === 'error' ? 'rgba(248,81,73,0.1)' : msg.type === 'ok' ? 'rgba(63,185,80,0.1)' : 'rgba(88,166,255,0.1)',
          border: `1px solid ${msg.type === 'error' ? C.red : msg.type === 'ok' ? C.green : C.blue}`,
          color: msg.type === 'error' ? C.red : msg.type === 'ok' ? C.green : C.blue,
        }}>
          {msg.text}
        </div>
      )}

      {/* Tab nav */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '0 28px' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '12px 18px', background: 'none',
                border: 'none', borderBottom: activeTab === t.key ? `2px solid ${C.text}` : '2px solid transparent',
                color: activeTab === t.key ? C.text : C.muted,
                fontSize: 14, fontWeight: activeTab === t.key ? 600 : 400, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  background: C.red, color: 'white', fontSize: 11, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center',
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 28px' }}>
        {activeTab === 'actions' && (
          <ActionsPanel recs={recs} onApprove={approve} onDismiss={dismiss} dryRun={status?.dryRun} />
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

// ── Sub-components ──────────────────────────────────────────────────────────

function Metric({ label, value }) {
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function ActionsPanel({ recs, onApprove, onDismiss, dryRun }) {
  if (recs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
        <div style={{ fontSize: 16 }}>No pending recommendations</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Run a scan to check the account for issues.</div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {recs.map(r => <RecommendationCard key={r.id} rec={r} onApprove={onApprove} onDismiss={onDismiss} dryRun={dryRun} />)}
    </div>
  )
}

function RecommendationCard({ rec, onApprove, onDismiss, dryRun }) {
  const [expanded, setExpanded] = useState(false)
  const catColour = CATEGORY_COLOURS[rec.category] || C.muted
  const sevColour = SEVERITY_COLOURS[rec.severity] || C.muted
  const impactColour = rec.projectedImpactDirection === 'save' ? C.green : C.blue
  const impactLabel  = rec.projectedImpactDirection === 'save' ? 'potential monthly saving' : 'potential monthly revenue'

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${sevColour}`,
      borderRadius: 8, padding: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
              color: catColour, border: `1px solid ${catColour}`, padding: '2px 8px', borderRadius: 4,
              background: `${catColour}15`,
            }}>
              {rec.category}
            </span>
            <span style={{ fontSize: 10, color: sevColour, fontWeight: 600, textTransform: 'uppercase' }}>{rec.severity}</span>
            <span style={{ fontSize: 12, color: C.muted }}>{rec.entityName}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{rec.issueTitle}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: impactColour }}>{fmt$(rec.projectedDollarImpact)}</div>
          <div style={{ fontSize: 10, color: C.muted }}>{impactLabel}</div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>What to fix</div>
          <div style={{ fontSize: 13 }}>{rec.whatToFix}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Why it should change</div>
          <div style={{ fontSize: 13, color: '#c9d1d9' }}>{rec.whyItShouldChange}</div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, padding: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Best practice source</div>
          <div style={{ fontSize: 12, color: '#c9d1d9', marginBottom: 6 }}>{rec.bestPracticeSummary}</div>
          {rec.bestPracticeSource && (
            <a href={rec.bestPracticeSource} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, fontSize: 12, wordBreak: 'break-all' }}>
              {rec.bestPracticeSource}
            </a>
          )}
          <div style={{ marginTop: 10, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Proposed change</div>
          <pre style={{ fontSize: 11, color: '#8b949e', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {JSON.stringify(rec.proposedChange, null, 2)}
          </pre>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={() => onApprove(rec.id)}
          style={{ background: C.text, color: C.bg, border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
        >
          {dryRun ? 'Approve (dry-run)' : 'Approve & Execute'}
        </button>
        <button
          onClick={() => onDismiss(rec.id)}
          style={{ background: 'none', color: C.muted, border: `1px solid ${C.border}`, padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
        >
          Dismiss
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer' }}
        >
          {expanded ? 'Less detail' : 'More detail'}
        </button>
      </div>
    </div>
  )
}

function BriefingPanel({ briefing, onGenerate }) {
  if (!briefing) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
        <div style={{ fontSize: 16 }}>No briefing generated yet</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>The daily briefing runs at 6am AEST, or trigger one now.</div>
        <button onClick={onGenerate} style={{ marginTop: 14, background: C.text, color: C.bg, border: 'none', padding: '10px 18px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
          Generate now
        </button>
      </div>
    )
  }

  const sections = [
    { key: 'algorithmUpdates',      label: 'Algorithm & Platform Updates' },
    { key: 'seasonalOpportunities', label: 'Seasonal Opportunities' },
    { key: 'competitorSignals',     label: 'Market Signals' },
    { key: 'accountHealthSummary',  label: 'Strategic Guidance' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Daily Intelligence Briefing</div>
          <div style={{ fontSize: 12, color: C.muted }}>{fmtDate(briefing.createdAt)}</div>
        </div>
        <button onClick={onGenerate} style={{ background: 'none', color: C.text, border: `1px solid ${C.border}`, padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
          Regenerate
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {sections.map(s => (
          <div key={s.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#c9d1d9' }}>{briefing[s.key] || 'No updates today.'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AuditPanel({ audit, onAccuracyCheck }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Audit Log</div>
        <button onClick={onAccuracyCheck} style={{ background: 'none', color: C.text, border: `1px solid ${C.border}`, padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
          Run Accuracy Check Now
        </button>
      </div>
      {audit.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>No audit events yet.</div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Time</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Event</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Actor</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.map(e => (
                <tr key={e.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{fmtDate(e.createdAt)}</td>
                  <td style={{ padding: '10px 14px', color: C.text, fontWeight: 500 }}>{e.eventType}</td>
                  <td style={{ padding: '10px 14px', color: C.muted }}>{e.triggeredBy}</td>
                  <td style={{ padding: '10px 14px', color: C.muted, fontSize: 11, fontFamily: 'monospace', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {JSON.stringify(e.details || {}).slice(0, 200)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SettingsPanel({ config, onSave }) {
  const [local, setLocal] = useState(config)
  useEffect(() => setLocal(config), [config])

  const fields = [
    { key: 'dryRun',                     label: 'Dry-run mode (no real API mutations)', type: 'bool' },
    { key: 'keywordBleedThresholdAud',   label: 'Keyword bleed threshold (AUD)',          type: 'number' },
    { key: 'campaignBleedThresholdAud',  label: 'Campaign bleed threshold (AUD)',         type: 'number' },
    { key: 'campaignBleedDays',          label: 'Campaign bleed days',                    type: 'number' },
    { key: 'zeroImpressionDays',         label: 'Zero impression cutoff (days)',          type: 'number' },
    { key: 'reallocationLowRoas',        label: 'Reallocation low ROAS trigger',          type: 'number', step: 0.1 },
    { key: 'reallocationHighRoas',       label: 'Reallocation high ROAS trigger',         type: 'number', step: 0.1 },
    { key: 'negativeKwMinClicks',        label: 'Negative keyword min clicks',            type: 'number' },
    { key: 'negativeKwMaxCtr',           label: 'Negative keyword max CTR (0-1)',         type: 'number', step: 0.001 },
    { key: 'breakevenCppAud',            label: 'Breakeven CPP (AUD)',                    type: 'number', step: 0.01 },
    { key: 'avgOrderValueAud',           label: 'Average order value (AUD)',              type: 'number', step: 0.01 },
    { key: 'grossMarginPct',             label: 'Gross margin (0-1)',                     type: 'number', step: 0.01 },
    { key: 'targetRoas',                 label: 'Target ROAS (x)',                        type: 'number', step: 0.1 },
    { key: 'accuracyCheckDays',          label: 'Accuracy check window (days)',           type: 'number' },
    { key: 'accuracyMaterialisedPct',    label: 'Accuracy materialised threshold (0-1)', type: 'number', step: 0.05 },
  ]

  function handleChange(key, val, type) {
    const next = { ...local }
    next[key] = type === 'bool' ? val : Number(val)
    setLocal(next)
  }

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Agent Thresholds</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {fields.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                {f.label}
              </label>
              {f.type === 'bool' ? (
                <select
                  value={local[f.key] ? 'true' : 'false'}
                  onChange={e => handleChange(f.key, e.target.value === 'true', 'bool')}
                  style={{ width: '100%', background: C.bg, color: C.text, border: `1px solid ${C.border}`, padding: 8, borderRadius: 4 }}
                >
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              ) : (
                <input
                  type="number"
                  value={local[f.key] ?? ''}
                  step={f.step || 1}
                  onChange={e => handleChange(f.key, e.target.value, 'number')}
                  style={{ width: '100%', background: C.bg, color: C.text, border: `1px solid ${C.border}`, padding: 8, borderRadius: 4 }}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <button
            onClick={() => onSave(local)}
            style={{ background: C.text, color: C.bg, border: 'none', padding: '10px 18px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
          >
            Save Thresholds
          </button>
          <button
            onClick={() => setLocal(config)}
            style={{ background: 'none', color: C.muted, border: `1px solid ${C.border}`, padding: '10px 18px', borderRadius: 6, cursor: 'pointer' }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
