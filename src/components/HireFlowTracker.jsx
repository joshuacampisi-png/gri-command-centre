import React from 'react'

/**
 * HireFlowTracker
 * Shared visual lifecycle tracker for TNT + Balloon hires.
 *
 * Renders an 8-step horizontal timeline with:
 *   · Numbered circle nodes that turn green + show ✓ when complete
 *   · Connecting bars that fill green as the customer progresses
 *   · Step labels + AEST timestamps under each completed step
 *   · A subtle pulse on the current "in progress" step
 *
 * Use everywhere a hire's lifecycle is shown. Replaces the previous
 * cramped inline FlowProgress in TNTDashboard + BalloonDashboard.
 */

const STEPS = [
  { key: 'booked',        label: 'Booked',         atField: 'createdAt',          test: () => true },
  { key: 'email',         label: 'Confirmation',   atField: 'confirmationSentAt', test: h => !!h.emailSent || !!h.confirmationSentAt },
  { key: 'bond',          label: 'Bond Paid',      atField: 'bondPaidAt',         test: h => h.bondStatus === 'paid' },
  { key: 'contract_sent', label: 'Contract Sent',  atField: 'contractSentAt',     test: h => ['sent', 'signed'].includes(h.contractStatus) },
  { key: 'signed',        label: 'Signed',         atField: 'contractSignedAt',   test: h => h.contractStatus === 'signed' },
  { key: 'picked_up',     label: 'Picked Up',      atField: 'pickedUpAt',         test: h => !!h.pickedUpAt },
  { key: 'returned',      label: 'Returned',       atField: 'returnedAt',         test: h => ['returned', 'withheld'].includes(h.status) },
  { key: 'outcome',       label: 'Bond Outcome',   atField: 'bondOutcomeAt',      test: h => !!h.bondOutcome, dynamicLabel: h => h.bondOutcome === 'withheld' ? 'Withheld' : (h.bondOutcome === 'refund_pending' ? 'Refund Pending' : (h.bondOutcome === 'refund_failed' ? 'Refund Failed' : 'Refunded')) },
]

function fmt(at) {
  if (!at) return ''
  try {
    return new Date(at).toLocaleString('en-AU', {
      timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

export default function HireFlowTracker({ hire, compact = false }) {
  const steps = STEPS.map(s => ({
    ...s,
    label: s.dynamicLabel ? s.dynamicLabel(hire) : s.label,
    done: s.test(hire),
    at: hire[s.atField],
  }))

  // The current step = first incomplete one (so we can pulse it)
  const currentIdx = steps.findIndex(s => !s.done)
  const lastDoneIdx = (currentIdx === -1 ? steps.length : currentIdx) - 1

  // Detect failure states for outcome step
  const finalStep = steps[steps.length - 1]
  const isFailed = finalStep.done && (hire.bondOutcome === 'withheld' || hire.bondOutcome === 'refund_failed')

  const sz = compact ? 22 : 28
  const fontMain = compact ? 11 : 12
  const fontMeta = compact ? 9 : 10

  return (
    <div style={{
      width: '100%',
      padding: compact ? '8px 4px' : '12px 6px',
      background: 'var(--color-background-secondary, #FAFAFA)',
      border: '0.5px solid var(--color-border-tertiary, #E5E7EB)',
      borderRadius: 10,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
        position: 'relative',
        alignItems: 'flex-start',
      }}>
        {/* Connecting line behind nodes */}
        <div style={{
          position: 'absolute',
          top: sz / 2,
          left: `calc((100% / ${steps.length}) / 2)`,
          right: `calc((100% / ${steps.length}) / 2)`,
          height: 3,
          background: 'var(--color-border-tertiary, #E5E7EB)',
          borderRadius: 2,
          zIndex: 0,
        }} />
        {/* Progress fill — runs left-to-right based on last completed step */}
        {lastDoneIdx > 0 && (
          <div style={{
            position: 'absolute',
            top: sz / 2,
            left: `calc((100% / ${steps.length}) / 2)`,
            width: `calc(${(lastDoneIdx / (steps.length - 1)) * 100}% - (100% / ${steps.length}))`,
            height: 3,
            background: isFailed ? '#EF4444' : '#10B981',
            borderRadius: 2,
            zIndex: 1,
            transition: 'width 0.4s ease',
          }} />
        )}

        {steps.map((step, i) => {
          const isCurrent = i === currentIdx
          const isLastDone = i === lastDoneIdx
          const isOutcomeFail = step.key === 'outcome' && step.done && isFailed
          const color = step.done
            ? (isOutcomeFail ? '#EF4444' : '#10B981')
            : (isCurrent ? '#3B82F6' : 'var(--color-border-tertiary, #D1D5DB)')
          const bg = step.done
            ? (isOutcomeFail ? '#FEE2E2' : '#D1FAE5')
            : (isCurrent ? '#DBEAFE' : 'var(--color-background-primary, #fff)')

          return (
            <div key={step.key} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              position: 'relative', zIndex: 2,
              gap: 4,
            }}>
              {/* Node circle */}
              <div style={{
                width: sz, height: sz,
                borderRadius: '50%',
                background: bg,
                border: `2px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: step.done ? '#fff' : color,
                fontSize: compact ? 11 : 13,
                fontWeight: 700,
                boxShadow: isLastDone || isCurrent ? `0 0 0 4px ${isOutcomeFail ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}` : 'none',
                transition: 'all 0.2s',
                background: step.done ? color : bg,
              }}>
                {step.done ? '✓' : (i + 1)}
              </div>
              {/* Label */}
              <div style={{
                fontSize: fontMain,
                fontWeight: step.done || isCurrent ? 600 : 400,
                color: step.done
                  ? (isOutcomeFail ? '#991B1B' : 'var(--color-text-primary, #111)')
                  : (isCurrent ? '#1E40AF' : 'var(--color-text-secondary, #6B7280)'),
                textAlign: 'center',
                lineHeight: 1.25,
                marginTop: 2,
                padding: '0 2px',
              }}>
                {step.label}
              </div>
              {/* Timestamp */}
              {step.done && step.at && (
                <div style={{
                  fontSize: fontMeta,
                  color: 'var(--color-text-secondary, #9CA3AF)',
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.2,
                }}>
                  {fmt(step.at)}
                </div>
              )}
              {/* Pulse indicator on current step */}
              {isCurrent && !step.done && (
                <div style={{
                  fontSize: fontMeta,
                  color: '#3B82F6',
                  fontWeight: 600,
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}>
                  in progress
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
