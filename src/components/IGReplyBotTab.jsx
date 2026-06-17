import { useState, useEffect, useCallback } from 'react'

const API = '/api/ig-reply-bot'

function fmtTime(iso) {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleString('en-AU', {
      timeZone: 'Australia/Brisbane',
      dateStyle: 'short',
      timeStyle: 'short'
    })
  } catch { return iso }
}

function fmtAgo(iso) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function IGReplyBotTab() {
  const [status, setStatus] = useState(null)
  const [log, setLog] = useState([])
  const [logTotal, setLogTotal] = useState(0)
  const [toneProfile, setToneProfile] = useState(null)
  const [showTone, setShowTone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [toggling, setToggling] = useState(false)

  const loadStatus = useCallback(() => {
    fetch(`${API}/status`)
      .then(r => r.json())
      .then(d => { if (d.ok) setStatus(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadLog = useCallback(() => {
    fetch(`${API}/log?limit=50`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setLog(d.entries || [])
          setLogTotal(d.total || 0)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadStatus()
    loadLog()
    const i1 = setInterval(loadStatus, 15000)
    const i2 = setInterval(loadLog, 30000)
    return () => { clearInterval(i1); clearInterval(i2) }
  }, [loadStatus, loadLog])

  const toggle = async () => {
    setToggling(true)
    try {
      const res = await fetch(`${API}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status?.enabled })
      })
      const d = await res.json()
      if (d.ok) loadStatus()
    } catch {}
    setToggling(false)
  }

  const refreshTone = async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`${API}/refresh-tone`, { method: 'POST' })
      const d = await res.json()
      if (d.ok && d.profile) setToneProfile(d.profile)
      loadStatus()
    } catch {}
    setRefreshing(false)
  }

  const loadTone = () => {
    if (toneProfile) { setShowTone(!showTone); return }
    fetch(`${API}/tone-profile`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.profile) setToneProfile(d.profile)
        setShowTone(true)
      })
      .catch(() => {})
  }

  if (loading) return <div className="loading"><div className="spinner" />Loading IG Reply Bot...</div>

  const s = status?.stats || {}
  const rl = status?.rateLimit || {}

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">Instagram Auto Reply Bot</h2>
          <p className="page-sub">Automatically replies to buying-intent comments on GRI Instagram posts</p>
        </div>
      </div>

      {/* Status + Toggle */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="ov-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Bot Status</div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: status?.enabled ? 'var(--green)' : 'var(--red)' }}>
              {status?.enabled ? 'ACTIVE' : 'DISABLED'}
            </div>
          </div>
          <button
            onClick={toggle}
            disabled={toggling}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: status?.enabled ? '1px solid var(--border)' : 'none',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              background: status?.enabled ? 'var(--bg-surface)' : 'var(--text)',
              color: status?.enabled ? 'var(--text)' : 'var(--bg-surface)'
            }}
          >
            {toggling ? '...' : status?.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>

        <div className="ov-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Replies Today</div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{s.repliesToday || 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total: {s.totalReplied || 0}</div>
        </div>

        <div className="ov-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Skipped Today</div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{s.skippedToday || 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total: {s.totalSkipped || 0}</div>
        </div>

        <div className="ov-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Rate Limit</div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: (rl.globalUsed || 0) > 15 ? 'var(--amber)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {rl.globalUsed || 0}/{rl.globalMax || 20}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>per hour</div>
        </div>
      </div>

      {/* Tone Profile + Webhook Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="ov-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>Tone Profile</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadTone} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
                {showTone ? 'Hide' : 'View'}
              </button>
              <button onClick={refreshTone} disabled={refreshing} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--text)', color: 'var(--bg-surface)', cursor: 'pointer', fontWeight: 600 }}>
                {refreshing ? 'Extracting...' : 'Refresh'}
              </button>
            </div>
          </div>
          {status?.toneProfile?.hasProfile ? (
            <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>
              Last extracted: {fmtTime(status.toneProfile.extractedAt)} ({fmtAgo(status.toneProfile.extractedAt)})
              <br />Posts analysed: {status.toneProfile.postCount}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--amber)' }}>No tone profile yet. Click "Refresh" to extract from your Instagram posts.</div>
          )}
          {showTone && toneProfile && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, maxHeight: 400, overflow: 'auto', color: 'var(--text-soft)' }}>
              {toneProfile.personality_traits && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text)' }}>Personality:</strong>{' '}
                  {toneProfile.personality_traits.join(', ')}
                </div>
              )}
              {toneProfile.vocabulary_patterns && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text)' }}>Vocabulary:</strong>{' '}
                  {toneProfile.vocabulary_patterns.join(', ')}
                </div>
              )}
              {toneProfile.sentence_structure && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text)' }}>Sentence style:</strong>{' '}
                  {toneProfile.sentence_structure}
                </div>
              )}
              {toneProfile.emoji_usage && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text)' }}>Emoji usage:</strong>{' '}
                  {toneProfile.emoji_usage}
                </div>
              )}
              {toneProfile.sales_approach && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text)' }}>Sales approach:</strong>{' '}
                  {toneProfile.sales_approach}
                </div>
              )}
              {toneProfile.example_reply_templates && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text)' }}>Example replies:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {toneProfile.example_reply_templates.map((t, i) => (
                      <li key={i} style={{ marginBottom: 4, color: 'var(--text-soft)' }}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ov-card">
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>Setup Info</h3>
          <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.8 }}>
            <div><strong style={{ color: 'var(--text)' }}>Webhook:</strong> <code style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>command-centre.up.railway.app/api/ig-reply-bot/webhook</code></div>
            <div><strong style={{ color: 'var(--text)' }}>Subscriptions:</strong> Comments + DMs</div>
            <div><strong style={{ color: 'var(--text)' }}>Last reply:</strong> {fmtTime(s.lastReplyAt)}</div>
            <div><strong style={{ color: 'var(--text)' }}>Tone refresh:</strong> Sundays 3am AEST (auto)</div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: 'var(--green-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--green)' }}>
            Connected to Meta App (GRI Social Publisher). Webhook active for Instagram comments and DMs.
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="ov-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>Activity Log</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{logTotal} total entries</span>
        </div>

        {log.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No comments processed yet. Enable the bot and connect the Meta webhook to get started.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: 'var(--bg-canvas)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Time</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>User</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Comment</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Intent</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Reply</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry, i) => (
                  <tr key={entry.commentId || i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(entry.processedAt)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-soft)' }}>@{entry.username}</td>
                    <td style={{ padding: '10px 12px', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-soft)' }}>
                      {entry.commentText}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        background: entry.intent === 'buying' ? 'var(--green-bg)' : entry.intent === 'error' ? 'var(--red-bg)' : 'var(--bg-subtle)',
                        color: entry.intent === 'buying' ? 'var(--green)' : entry.intent === 'error' ? 'var(--red)' : 'var(--text-muted)'
                      }}>
                        {entry.intent || 'skip'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: entry.replied ? 'var(--green)' : 'var(--text-muted)' }}>
                      {entry.replied ? entry.replyText : (entry.reason || 'Skipped')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
