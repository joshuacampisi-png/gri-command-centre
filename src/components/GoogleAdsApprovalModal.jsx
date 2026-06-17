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
 * imported anywhere. Styling is self-contained in a <style> block scoped
 * via .gmodal-* classes so it never conflicts with the dashboard CSS.
 *
 * Visual language: Apple/Stripe-style minimalist — light surface,
 * hairline borders, graphite text, semantic green/amber/red/blue pulled
 * from the global design tokens in src/styles.css. No gradients, no
 * heavy shadows, no serif display type.
 */

// Semantic palette mapped to the global design system tokens.
// Kept as a local object so the component remains drop-in portable,
// but every value points to the Apple/Stripe-style CSS variables.
const G = {
  blue:   'var(--blue)',
  red:    'var(--red)',
  yellow: 'var(--amber)',
  green:  'var(--green)',
  violet: 'var(--text-soft)',
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
    return { label: 'Executed on Google Ads', colour: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-bg)', glyph: '✓' }
  }
  if (c?.dryRun) {
    return { label: 'Recorded in audit log · dry-run', colour: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-bg)', glyph: '◆' }
  }
  if (c?.blockedByProtection) {
    return { label: 'Manual review required · protected campaign', colour: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-bg)', glyph: '⚑' }
  }
  if (!c?.success) {
    return { label: 'Failed — see execution result', colour: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-bg)', glyph: '✕' }
  }
  return { label: 'Recorded', colour: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue-bg)', glyph: '◐' }
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
            <div className="gmodal-check" style={{ borderColor: badge.border, background: badge.bg, color: badge.colour }}>
              {badge.glyph}
            </div>
            <div>
              <div className="gmodal-eyebrow">Decision recorded · {fmtDateTime(c.recordedAt)}</div>
              <div className="gmodal-title">{c.mutationSummary || 'Approval recorded'}</div>
              <div className="gmodal-status" style={{ color: badge.colour, borderColor: badge.border, background: badge.bg }}>
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
                <div className="gmodal-forecast-cell-val" style={{ color: (forecast.netSpendChangeAud || 0) < 0 ? 'var(--green)' : (forecast.netSpendChangeAud || 0) > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                  {(forecast.netSpendChangeAud || 0) > 0 ? '+' : ''}{fmtAud(forecast.netSpendChangeAud || 0)}
                </div>
              </div>
              <div className="gmodal-forecast-cell">
                <div className="gmodal-forecast-cell-lbl">Revenue Δ/mo</div>
                <div className="gmodal-forecast-cell-val" style={{ color: (monthly.revenueChangeAud || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {(monthly.revenueChangeAud || 0) > 0 ? '+' : ''}{fmtAud(monthly.revenueChangeAud || 0)}
                </div>
              </div>
              <div className="gmodal-forecast-cell">
                <div className="gmodal-forecast-cell-lbl">Net profit Δ/mo</div>
                <div className="gmodal-forecast-cell-val" style={{ color: (monthly.netProfitChangeAud || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {(monthly.netProfitChangeAud || 0) > 0 ? '+' : ''}{fmtAud(monthly.netProfitChangeAud || 0)}
                </div>
              </div>
              <div className="gmodal-forecast-cell">
                <div className="gmodal-forecast-cell-lbl">Confidence</div>
                <div className="gmodal-forecast-cell-val" style={{ color: forecast.confidence === 'high' ? 'var(--green)' : forecast.confidence === 'medium' ? 'var(--amber)' : 'var(--text-muted)', textTransform: 'uppercase', fontSize: 13 }}>
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
.gmodal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(10, 10, 10, 0.32);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  animation: gmodal-fade-in 220ms ease-out;
  font-family: var(--font-sans);
}

.gmodal-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 720px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  color: var(--text);
  animation: gmodal-slide-up 280ms cubic-bezier(0.2, 0.9, 0.3, 1.0);
}

.gmodal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 28px 20px;
  gap: 20px;
  border-bottom: 1px solid var(--border);
}

.gmodal-head-left {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
}

.gmodal-check {
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 18px;
  flex-shrink: 0;
}

.gmodal-eyebrow {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.gmodal-title {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 20px;
  line-height: 1.25;
  color: var(--text);
  letter-spacing: -0.015em;
  margin-bottom: 10px;
}

.gmodal-status {
  display: inline-flex;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid;
}

.gmodal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: all 140ms ease;
  flex-shrink: 0;
}

.gmodal-close:hover {
  color: var(--text);
  background: var(--bg-subtle);
}

.gmodal-section {
  padding: 20px 28px;
  border-bottom: 1px solid var(--border);
}

.gmodal-section:last-child {
  border-bottom: none;
}

.gmodal-section-highlight {
  background: var(--bg-canvas);
}

.gmodal-section-label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.gmodal-entity-name {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
  letter-spacing: -0.01em;
  margin-bottom: 4px;
}

.gmodal-entity-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
}

.gmodal-mono {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.gmodal-sep {
  color: var(--text-faint);
}

.gmodal-action-name {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.005em;
  margin-bottom: 4px;
}

.gmodal-action-detail {
  font-size: 13.5px;
  color: var(--text-soft);
  line-height: 1.55;
  margin-bottom: 10px;
}

.gmodal-api-box {
  margin-top: 12px;
  padding: 12px 14px;
  background: var(--bg-canvas);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.gmodal-api-label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.gmodal-api-code {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-soft);
  line-height: 1.55;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
}

.gmodal-forecast-formula {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-soft);
  padding: 12px 14px;
  background: var(--bg-canvas);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
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
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.gmodal-forecast-cell-val {
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text);
}

.gmodal-accuracy-date-num {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
  letter-spacing: -0.01em;
}

.gmodal-accuracy-desc {
  margin-top: 8px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-soft);
}

.gmodal-accuracy-desc strong {
  color: var(--text);
  font-weight: 600;
}

.gmodal-accuracy-measuring {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--text-soft);
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.gmodal-accuracy-measuring-label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-right: 4px;
}

.gmodal-audit-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 24px;
  padding-top: 24px;
  flex-wrap: wrap;
}

.gmodal-audit-id {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  font-weight: 500;
}

.gmodal-audit-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.gmodal-ack {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 13.5px;
  padding: 10px 22px;
  border-radius: var(--radius-sm);
  background: var(--text);
  color: var(--bg-surface);
  border: 1px solid var(--text);
  cursor: pointer;
  transition: opacity 140ms ease, transform 140ms ease;
}

.gmodal-ack:hover {
  opacity: 0.88;
}

.gmodal-ack:active {
  transform: translateY(1px);
}

@keyframes gmodal-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes gmodal-slide-up {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
`
