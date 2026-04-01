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
            <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Bot Status</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: status?.enabled ? '#22c55e' : '#ef4444' }}>
              {status?.enabled ? 'ACTIVE' : 'DISABLED'}
            </div>
          </div>
          <button
            onClick={toggle}
            disabled={toggling}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              background: status?.enabled ? '#ef4444' : '#22c55e',
              color: '#fff'
            }}
          >
            {toggling ? '...' : status?.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>

        <div className="ov-card">
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Replies Today</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{s.repliesToday || 0}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Total: {s.totalReplied || 0}</div>
        </div>

        <div className="ov-card">
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Skipped Today</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#888' }}>{s.skippedToday || 0}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Total: {s.totalSkipped || 0}</div>
        </div>

        <div className="ov-card">
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Rate Limit</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: (rl.globalUsed || 0) > 15 ? '#f59e0b' : '#22c55e' }}>
            {rl.globalUsed || 0}/{rl.globalMax || 20}
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>per hour</div>
        </div>
      </div>

      {/* Tone Profile + Webhook Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="ov-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Tone Profile</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadTone} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#ccc', cursor: 'pointer' }}>
                {showTone ? 'Hide' : 'View'}
              </button>
              <button onClick={refreshTone} disabled={refreshing} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
                {refreshing ? 'Extracting...' : 'Refresh'}
              </button>
            </div>
          </div>
          {status?.toneProfile?.hasProfile ? (
            <div style={{ fontSize: 13, color: '#aaa' }}>
              Last extracted: {fmtTime(status.toneProfile.extractedAt)} ({fmtAgo(status.toneProfile.extractedAt)})
              <br />Posts analysed: {status.toneProfile.postCount}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#f59e0b' }}>No tone profile yet. Click "Refresh" to extract from your Instagram posts.</div>
          )}
          {showTone && toneProfile && (
            <div style={{ marginTop: 12, padding: 12, background: '#1a1a2e', borderRadius: 8, fontSize: 12, maxHeight: 400, overflow: 'auto' }}>
              {toneProfile.personality_traits && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#6366f1' }}>Personality:</strong>{' '}
                  {toneProfile.personality_traits.join(', ')}
                </div>
              )}
              {toneProfile.vocabulary_patterns && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#6366f1' }}>Vocabulary:</strong>{' '}
                  {toneProfile.vocabulary_patterns.join(', ')}
                </div>
              )}
              {toneProfile.sentence_structure && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#6366f1' }}>Sentence style:</strong>{' '}
                  {toneProfile.sentence_structure}
                </div>
              )}
              {toneProfile.emoji_usage && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#6366f1' }}>Emoji usage:</strong>{' '}
                  {toneProfile.emoji_usage}
                </div>
              )}
              {toneProfile.sales_approach && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#6366f1' }}>Sales approach:</strong>{' '}
                  {toneProfile.sales_approach}
                </div>
              )}
              {toneProfile.example_reply_templates && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#6366f1' }}>Example replies:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {toneProfile.example_reply_templates.map((t, i) => (
                      <li key={i} style={{ marginBottom: 4, color: '#ccc' }}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ov-card">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Setup Info</h3>
          <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.8 }}>
            <div><strong>Webhook:</strong> <code style={{ background: '#1a1a2e', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>command-centre.up.railway.app/api/ig-reply-bot/webhook</code></div>
            <div><strong>Subscriptions:</strong> Comments + DMs</div>
            <div><strong>Last reply:</strong> {fmtTime(s.lastReplyAt)}</div>
            <div><strong>Tone refresh:</strong> Sundays 3am AEST (auto)</div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: '#0a2e0a', borderRadius: 8, fontSize: 12, color: '#22c55e' }}>
            Connected to Meta App (GRI Social Publisher). Webhook active for Instagram comments and DMs.
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="ov-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Activity Log</h3>
          <span style={{ fontSize: 12, color: '#888' }}>{logTotal} total entries</span>
        </div>

        {log.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
            No comments processed yet. Enable the bot and connect the Meta webhook to get started.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#111', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', color: '#888', fontWeight: 600 }}>Time</th>
                  <th style={{ padding: '10px 12px', color: '#888', fontWeight: 600 }}>User</th>
                  <th style={{ padding: '10px 12px', color: '#888', fontWeight: 600 }}>Comment</th>
                  <th style={{ padding: '10px 12px', color: '#888', fontWeight: 600 }}>Intent</th>
                  <th style={{ padding: '10px 12px', color: '#888', fontWeight: 600 }}>Reply</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry, i) => (
                  <tr key={entry.commentId || i} style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <td style={{ padding: '10px 12px', color: '#888', whiteSpace: 'nowrap' }}>{fmtTime(entry.processedAt)}</td>
                    <td style={{ padding: '10px 12px', color: '#ccc' }}>@{entry.username}</td>
                    <td style={{ padding: '10px 12px', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc' }}>
                      {entry.commentText}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        background: entry.intent === 'buying' ? '#22c55e22' : entry.intent === 'error' ? '#ef444422' : '#88888822',
                        color: entry.intent === 'buying' ? '#22c55e' : entry.intent === 'error' ? '#ef4444' : '#888'
                      }}>
                        {entry.intent || 'skip'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: entry.replied ? '#22c55e' : '#666' }}>
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
