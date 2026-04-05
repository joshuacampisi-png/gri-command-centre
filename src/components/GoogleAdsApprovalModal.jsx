/**
 * GoogleAdsApprovalModal.jsx
 *
 * Standalone post-approval confirmation modal. Renders when an Approve
 * click succeeds and surfaces EVERYTHING Josh needs to know about the
 * decision he just made:
 *
 *   - What entity was acted on (name, id, type, campaign context)
 *   - Exact mutation that ran (PAUSE_CAMPAIGN / ADD_NEGATIVE / etc)
 *   - API call status: executed, dry-run audit, or protected manual
 *   - Audit log entry ID + timestamp
 *   - Forecast snapshot (what we projected at approval time)
 *   - 7-day accuracy check date + what the agent will measure
 *   - Protection level reminder if applicable
 *
 * Pure presentational component — no API calls, no state beyond the
 * controlled `confirmation` prop and an internal close handler. Can be
 * imported anywhere. Styling is self-contained in a <style> block so it
 * never conflicts with the dashboard's existing CSS scope.
 */

// Google brand palette (local copy to keep this component truly standalone)
const G = {
  blue:   '#4285F4',
  red:    '#EA4335',
  yellow: '#FBBC04',
  green:  '#34A853',
  violet: '#A142F4',
}

function fmtAud(n, decimals = 0) {
  if (n == null || isNaN(n)) return '$0'
  const abs = Math.abs(Number(n))
  const sign = Number(n) < 0 ? '-' : ''
  return sign + '$' + abs.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Australia/Brisbane',
    })
  } catch { return iso }
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Australia/Brisbane',
    })
  } catch { return iso }
}

// ── Status badge config ─────────────────────────────────────────────────────

function getStatusBadge(c) {
  if (c?.apiCallMade && c?.success) {
    return { label: 'Executed on Google Ads', colour: G.green, glyph: '✓' }
  }
  if (c?.dryRun) {
    return { label: 'Recorded in audit log · dry-run', colour: G.yellow, glyph: '◆' }
  }
  if (c?.blockedByProtection) {
    return { label: 'Manual review required · protected campaign', colour: G.yellow, glyph: '⚑' }
  }
  if (!c?.success) {
    return { label: 'Failed — see execution result', colour: G.red, glyph: '✕' }
  }
  return { label: 'Recorded', colour: G.blue, glyph: '◐' }
}

// ── Component ───────────────────────────────────────────────────────────────

export function GoogleAdsApprovalModal({ confirmation, onClose }) {
  if (!confirmation) return null

  const c = confirmation
  const badge = getStatusBadge(c)
  const forecast = c.forecastSnapshot || {}
  const monthly = forecast.monthly || {}

  function handleBackdropClick(e) {
    if (e.target.classList.contains('gmodal-backdrop')) onClose?.()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose?.()
  }

  return (
    <div
      className="gmodal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <style>{modalStyles}</style>

      <div className="gmodal-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="gmodal-head">
          <div className="gmodal-head-left">
            <div className="gmodal-check" style={{ borderColor: `${badge.colour}55`, background: `${badge.colour}18`, color: badge.colour }}>
              {badge.glyph}
            </div>
            <div>
              <div className="gmodal-eyebrow">Decision recorded · {fmtDateTime(c.recordedAt)}</div>
              <div className="gmodal-title">{c.mutationSummary || 'Approval recorded'}</div>
              <div className="gmodal-status" style={{ color: badge.colour, borderColor: `${badge.colour}55` }}>
                {badge.label}
              </div>
            </div>
          </div>
          <button className="gmodal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Entity + mutation row */}
        <div className="gmodal-section">
          <div className="gmodal-section-label">Entity acted on</div>
          <div className="gmodal-entity">
            <div className="gmodal-entity-name">{c.entityName || '—'}</div>
            <div className="gmodal-entity-meta">
              {c.entityType && <span>{c.entityType}</span>}
              {c.entityId && <><span className="gmodal-sep">·</span><span className="gmodal-mono">id: {c.entityId}</span></>}
              {c.campaignContext?.name && <><span className="gmodal-sep">·</span><span>{c.campaignContext.name}</span></>}
              {c.campaignContext?.channel && <><span className="gmodal-sep">·</span><span>{c.campaignContext.channel}</span></>}
            </div>
          </div>
        </div>

        {/* Mutation detail */}
        <div className="gmodal-section">
          <div className="gmodal-section-label">What the agent did</div>
          <div className="gmodal-action">
            <div className="gmodal-action-name">{c.actionLabel || c.action || 'N/A'}</div>
            {c.actionDetail && <div className="gmodal-action-detail">{c.actionDetail}</div>}
          </div>
          {c.apiCallDetail && (
            <div className="gmodal-api-box">
              <div className="gmodal-api-label">Google Ads API call</div>
              <pre className="gmodal-api-code">{typeof c.apiCallDetail === 'string' ? c.apiCallDetail : JSON.stringify(c.apiCallDetail, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Forecast snapshot */}
        {forecast.formula && (
          <div className="gmodal-section">
            <div className="gmodal-section-label">Forecast snapshot at approval time</div>
            <div className="gmodal-forecast-formula">{forecast.formula}</div>
            <div className="gmodal-forecast-grid">
              <div className="gmodal-forecast-cell">
                <div className="gmodal-forecast-cell-lbl">Net spend/mo</div>
                <div className="gmodal-forecast-cell-val" style={{ color: (forecast.netSpendChangeAud || 0) < 0 ? G.green : (forecast.netSpendChangeAud || 0) > 0 ? G.red : '#8b8f9c' }}>
                  {(forecast.netSpendChangeAud || 0) > 0 ? '+' : ''}{fmtAud(forecast.netSpendChangeAud || 0)}
                </div>
              </div>
              <div className="gmodal-forecast-cell">
                <div className="gmodal-forecast-cell-lbl">Revenue Δ/mo</div>
                <div className="gmodal-forecast-cell-val" style={{ color: (monthly.revenueChangeAud || 0) >= 0 ? G.green : G.red }}>
                  {(monthly.revenueChangeAud || 0) > 0 ? '+' : ''}{fmtAud(monthly.revenueChangeAud || 0)}
                </div>
              </div>
              <div className="gmodal-forecast-cell">
                <div className="gmodal-forecast-cell-lbl">Net profit Δ/mo</div>
                <div className="gmodal-forecast-cell-val" style={{ color: (monthly.netProfitChangeAud || 0) >= 0 ? G.green : G.red }}>
                  {(monthly.netProfitChangeAud || 0) > 0 ? '+' : ''}{fmtAud(monthly.netProfitChangeAud || 0)}
                </div>
              </div>
              <div className="gmodal-forecast-cell">
                <div className="gmodal-forecast-cell-lbl">Confidence</div>
                <div className="gmodal-forecast-cell-val" style={{ color: forecast.confidence === 'high' ? G.green : forecast.confidence === 'medium' ? G.yellow : '#8b8f9c', textTransform: 'uppercase', fontSize: 13 }}>
                  {forecast.confidence || 'unknown'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 7-day accuracy check */}
        {c.accuracyCheckDueAt && (
          <div className="gmodal-section gmodal-section-highlight">
            <div className="gmodal-section-label">7-day accuracy check</div>
            <div className="gmodal-accuracy">
              <div className="gmodal-accuracy-date">
                <span className="gmodal-accuracy-date-num">{fmtDate(c.accuracyCheckDueAt)}</span>
              </div>
              <div className="gmodal-accuracy-desc">
                The agent will measure the actual impact of this change against the forecast above.
                If the projected {forecast.monthly?.revenueChangeAud >= 0 ? 'revenue lift' : 'spend saving'} of <strong>{fmtAud(Math.abs(forecast.monthly?.netProfitChangeAud || 0))}/mo net profit</strong> does not materialise at &ge; 40%, a <strong>revert approval card</strong> will be raised automatically in your Findings queue. The agent will NOT revert anything without your explicit click.
              </div>
              {c.whatWeAreMeasuring && (
                <div className="gmodal-accuracy-measuring">
                  <span className="gmodal-accuracy-measuring-label">Measuring:</span> {c.whatWeAreMeasuring}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit trail */}
        <div className="gmodal-section gmodal-audit-row">
          <div>
            <div className="gmodal-section-label">Audit log entry</div>
            <div className="gmodal-audit-id">{c.auditEventType || 'approved_and_executed'}</div>
            {c.recommendationId && (
              <div className="gmodal-audit-meta">rec: <span className="gmodal-mono">{c.recommendationId}</span></div>
            )}
          </div>
          <button className="gmodal-ack" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Self-contained stylesheet ───────────────────────────────────────────────

const modalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=JetBrains+Mono:wght@500&display=swap');

.gmodal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(4, 5, 9, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  animation: gmodal-fade-in 220ms ease-out;
  font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
}

.gmodal-card {
  background: linear-gradient(180deg, #12141a 0%, #0a0b0f 100%);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 18px;
  width: 100%;
  max-width: 720px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  box-shadow:
    0 40px 80px -20px rgba(0,0,0,0.75),
    0 0 0 1px rgba(255,255,255,0.02);
  color: #f5f6f8;
  animation: gmodal-slide-up 320ms cubic-bezier(0.2, 0.9, 0.3, 1.05);
}

.gmodal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 28px 32px 20px;
  gap: 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.gmodal-head-left {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
}

.gmodal-check {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 700;
  font-size: 22px;
  flex-shrink: 0;
  box-shadow: 0 12px 28px -14px rgba(52,168,83,0.4);
}

.gmodal-eyebrow {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8b8f9c;
  margin-bottom: 4px;
}

.gmodal-title {
  font-family: 'Fraunces', ui-serif, Georgia, serif;
  font-weight: 500;
  font-size: 24px;
  line-height: 1.2;
  color: #f5f6f8;
  letter-spacing: -0.015em;
  margin-bottom: 8px;
}

.gmodal-status {
  display: inline-flex;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid;
  background: rgba(255,255,255,0.02);
}

.gmodal-close {
  background: none;
  border: none;
  color: #8b8f9c;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 160ms ease;
  flex-shrink: 0;
}

.gmodal-close:hover {
  color: #f5f6f8;
  background: rgba(255,255,255,0.05);
}

.gmodal-section {
  padding: 20px 32px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.gmodal-section:last-child {
  border-bottom: none;
}

.gmodal-section-highlight {
  background:
    linear-gradient(90deg, rgba(66,133,244,0.08), transparent 70%),
    transparent;
}

.gmodal-section-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8b8f9c;
  margin-bottom: 10px;
}

.gmodal-entity-name {
  font-family: 'Fraunces', ui-serif, Georgia, serif;
  font-weight: 500;
  font-size: 18px;
  color: #f5f6f8;
  letter-spacing: -0.01em;
  margin-bottom: 4px;
}

.gmodal-entity-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  color: #8b8f9c;
}

.gmodal-mono {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.gmodal-sep {
  color: #3a3e4b;
}

.gmodal-action-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 14px;
  font-weight: 600;
  color: #f5f6f8;
  letter-spacing: -0.005em;
  margin-bottom: 4px;
}

.gmodal-action-detail {
  font-size: 13px;
  color: #c9d1d9;
  line-height: 1.55;
  margin-bottom: 10px;
}

.gmodal-api-box {
  margin-top: 12px;
  padding: 12px 14px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
}

.gmodal-api-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #5a5e6b;
  margin-bottom: 6px;
}

.gmodal-api-code {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  color: #8b8f9c;
  line-height: 1.55;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
}

.gmodal-forecast-formula {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  line-height: 1.6;
  color: #c9d1d9;
  padding: 12px 14px;
  background: rgba(66,133,244,0.06);
  border: 1px solid rgba(66,133,244,0.2);
  border-radius: 8px;
  margin-bottom: 12px;
}

.gmodal-forecast-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 640px) {
  .gmodal-forecast-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.gmodal-forecast-cell-lbl {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #5a5e6b;
  margin-bottom: 4px;
}

.gmodal-forecast-cell-val {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.gmodal-accuracy-date-num {
  font-family: 'Fraunces', ui-serif, Georgia, serif;
  font-weight: 500;
  font-size: 19px;
  color: #4285F4;
  letter-spacing: -0.01em;
}

.gmodal-accuracy-desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: #c9d1d9;
}

.gmodal-accuracy-desc strong {
  color: #f5f6f8;
  font-weight: 600;
}

.gmodal-accuracy-measuring {
  margin-top: 10px;
  font-size: 12px;
  color: #8b8f9c;
  padding: 8px 12px;
  background: rgba(255,255,255,0.02);
  border-radius: 6px;
}

.gmodal-accuracy-measuring-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5a5e6b;
  margin-right: 4px;
}

.gmodal-audit-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 26px;
  padding-top: 24px;
  flex-wrap: wrap;
}

.gmodal-audit-id {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  color: #f5f6f8;
  font-weight: 500;
}

.gmodal-audit-meta {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  color: #5a5e6b;
  margin-top: 4px;
}

.gmodal-ack {
  font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  font-size: 14px;
  padding: 12px 26px;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #e0e4ec 100%);
  color: #0a0b0f;
  border: none;
  cursor: pointer;
  box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 10px 24px -10px rgba(255,255,255,0.25);
  transition: transform 120ms ease, box-shadow 220ms ease;
}

.gmodal-ack:hover {
  transform: translateY(-1px);
  box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 14px 30px -10px rgba(52,168,83,0.45);
}

@keyframes gmodal-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes gmodal-slide-up {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
`
