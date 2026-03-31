import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────

const POST_TYPES = ['image', 'carousel', 'reel']
const POST_TYPE_LABELS = { image: 'Image', carousel: 'Carousel', reel: 'Reel' }
const POST_TYPE_ICONS = { image: '🖼', carousel: '🎠', reel: '🎬' }
const STATUS_COLORS = { DRAFT: '#9CA3AF', SCHEDULED: '#3B82F6', PUBLISHING: '#F59E0B', PUBLISHED: '#059669', FAILED: '#DC2626' }
const ACCEPT_MEDIA = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.mp4,.mov'
const API = '/api/instagram'
const META_API = '/api/meta'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
function fmtDate(d) { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }
function fmtDateTime(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

// ── API helpers ──────────────────────────────────────────────────────────────

async function fetchPosts() {
  const res = await fetch(`${API}/entries`)
  return res.ok ? res.json() : []
}

async function savePost(post) {
  const res = await fetch(`${API}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(post) })
  if (!res.ok) throw new Error(`Save failed: ${res.status}`)
  return res.json()
}

async function deletePostAPI(id) {
  await fetch(`${API}/entries/${id}`, { method: 'DELETE' })
}

async function publishNowAPI(id) {
  const res = await fetch(`${API}/entries/${id}/publish-now`, { method: 'POST' })
  return res.json()
}

async function uploadMediaAPI(files) {
  const form = new FormData()
  for (const file of files) form.append('media', file)
  const res = await fetch(`${API}/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Upload failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function generateCaptionAPI(params) {
  const res = await fetch(`${API}/generate-caption`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) })
  if (!res.ok) throw new Error('Caption generation failed')
  return res.json()
}

// ── Calendar helpers ─────────────────────────────────────────────────────────

function getMonthDays(year, month) {
  const first = new Date(year, month, 1)
  const startDay = (first.getDay() + 6) % 7
  const days = []
  for (let i = -startDay; i < 42 - startDay; i++) {
    const d = new Date(year, month, 1 + i)
    days.push(d)
  }
  return days
}

// ── Connect Panel ────────────────────────────────────────────────────────────

function ConnectPanel({ onConnected }) {
  const [token, setToken] = useState('')
  const [igId, setIgId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  async function handleConnect() {
    if (!token.trim() || !igId.trim()) { setError('Both fields are required.'); return }
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch(`${META_API}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageAccessToken: token.trim(), igAccountId: igId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Connection failed'); setConnecting(false); return }
      onConnected(data)
    } catch (err) {
      setError(err.message)
    }
    setConnecting(false)
  }

  return (
    <div className="ig-connect-panel">
      <div className="ig-connect-icon">📸</div>
      <h3>Connect Instagram</h3>
      <p className="muted">Paste your Meta Page Access Token and Instagram Business Account ID to start auto-posting.</p>

      <div className="ig-connect-form">
        <div className="ig-field">
          <label>Meta Page Access Token</label>
          <textarea
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="EAF4DTu..."
            rows={3}
            className="ig-token-input"
          />
          <span className="muted">Get this from Meta Graph API Explorer or your app dashboard</span>
        </div>

        <div className="ig-field">
          <label>Instagram Business Account ID</label>
          <input
            value={igId}
            onChange={e => setIgId(e.target.value)}
            placeholder="17841448049372007"
          />
          <span className="muted">Found in Graph API: /me/accounts?fields=instagram_business_account</span>
        </div>

        {error && <div className="ig-error-box">{error}</div>}

        <button className="btn btn-primary" onClick={handleConnect} disabled={connecting} style={{ width: '100%', justifyContent: 'center' }}>
          {connecting ? 'Validating...' : 'Connect Instagram'}
        </button>
      </div>
    </div>
  )
}

// ── Connected Account Bar ────────────────────────────────────────────────────

function AccountBar({ account, onDisconnect }) {
  return (
    <div className="ig-account-bar">
      <div className="ig-account-info">
        <span className="ig-account-dot" />
        <strong>@{account.igUsername || 'connected'}</strong>
        {account.pageName && <span className="muted"> via {account.pageName}</span>}
      </div>
      <button className="btn btn-danger btn-sm" onClick={onDisconnect}>Disconnect</button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function InstagramScheduler() {
  const [posts, setPosts] = useState([])
  const [view, setView] = useState('calendar')
  const [drawer, setDrawer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [captionVariants, setCaptionVariants] = useState(null)
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [connection, setConnection] = useState(null) // null = loading, false = not connected, object = connected
  const [dragOver, setDragOver] = useState(null) // date string of day being dragged over
  const [autoPosting, setAutoPosting] = useState(null) // date string being auto-processed
  const fileRef = useRef(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const data = await fetchPosts()
    setPosts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  // Load connection status + posts
  useEffect(() => {
    reload()
    fetch(`${META_API}/status`).then(r => r.json()).then(d => {
      setConnection(d.connected ? d : false)
    }).catch(() => setConnection(false))
    const interval = setInterval(reload, 30000)
    return () => clearInterval(interval)
  }, [reload])

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now - 7 * 86400000)
    const thisWeek = posts.filter(p => new Date(p.scheduledAt || p.createdAt) >= weekAgo)
    return {
      total: posts.length,
      scheduled: posts.filter(p => p.status === 'SCHEDULED').length,
      published: posts.filter(p => p.status === 'PUBLISHED').length,
      failed: posts.filter(p => p.status === 'FAILED').length,
      thisWeek: thisWeek.length,
    }
  }, [posts])

  // ── New post ───────────────────────────────────────────────────────────────

  function newPost(date) {
    const scheduledAt = date ? new Date(date) : new Date()
    scheduledAt.setHours(10, 0, 0, 0)
    setDrawer({
      id: uid(),
      type: 'image',
      mediaUrls: [],
      caption: '',
      scheduledAt: scheduledAt.toISOString(),
      status: 'DRAFT',
      productContext: '',
      mediaDescription: '',
    })
    setCaptionVariants(null)
  }

  // ── Drag & drop onto calendar day ──────────────────────────────────────────
  // Drop video/image onto a day → upload → auto-generate caption → auto-schedule

  function handleCalDragOver(e, day) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(fmtDate(day))
  }

  function handleCalDragLeave() {
    setDragOver(null)
  }

  async function handleCalDrop(e, day) {
    e.preventDefault()
    setDragOver(null)

    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    )
    if (files.length === 0) return

    const dateKey = fmtDate(day)
    setAutoPosting(dateKey)

    try {
      // 1. Upload the files
      const uploadResult = await uploadMediaAPI(files)
      if (!uploadResult.files?.length) throw new Error('Upload returned no files')

      const mediaUrls = uploadResult.files.map(f => f.url)
      const hasVideo = uploadResult.files.some(f => f.type === 'video')
      const postType = mediaUrls.length > 1 ? 'carousel' : hasVideo ? 'reel' : 'image'

      // 2. Auto-generate caption
      let caption = ''
      try {
        const captionResult = await generateCaptionAPI({ postType })
        if (captionResult.variants?.[0]) {
          const v = captionResult.variants[0]
          caption = `${v.hook}\n\n${v.body}\n\n${v.cta}\n\n${v.hashtags}`
        }
      } catch {
        caption = '' // Non-fatal — post without caption rather than fail
      }

      // 3. Create + schedule the post for 10am AEST on that day
      const scheduledAt = new Date(day)
      scheduledAt.setHours(0, 0, 0, 0) // midnight UTC = 10am AEST
      const post = {
        id: uid(),
        type: postType,
        mediaUrls,
        caption,
        scheduledAt: scheduledAt.toISOString(),
        status: 'SCHEDULED',
      }
      await savePost(post)
      await reload()
    } catch (err) {
      alert('Auto-post failed: ' + err.message)
    }
    setAutoPosting(null)
  }

  // ── Save post ──────────────────────────────────────────────────────────────

  async function handleSave(status) {
    if (!drawer) return
    setSaving(true)
    try {
      const post = { ...drawer, status: status || drawer.status }
      await savePost(post)
      await reload()
      setDrawer(null)
    } catch (err) {
      alert('Save failed: ' + err.message)
    }
    setSaving(false)
  }

  // ── Delete post ────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!drawer || !confirm('Delete this post?')) return
    await deletePostAPI(drawer.id)
    await reload()
    setDrawer(null)
  }

  // ── Publish now ────────────────────────────────────────────────────────────

  async function handlePublishNow() {
    if (!drawer || !confirm('Publish this post to Instagram right now?')) return
    setSaving(true)
    try {
      await savePost(drawer)
      const result = await publishNowAPI(drawer.id)
      if (result.error) alert('Publish failed: ' + result.error)
      await reload()
      setDrawer(null)
    } catch (err) {
      alert('Publish failed: ' + err.message)
    }
    setSaving(false)
  }

  // ── Media upload (drawer) ─────────────────────────────────────────────────

  async function handleUpload(e) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const result = await uploadMediaAPI(files)
      if (result.files) {
        setDrawer(prev => ({
          ...prev,
          mediaUrls: [...(prev.mediaUrls || []), ...result.files.map(f => f.url)],
          type: result.files.length > 1 || (prev.mediaUrls || []).length + result.files.length > 1
            ? 'carousel'
            : result.files[0].type === 'video' ? 'reel' : prev.type
        }))
      }
    } catch (err) {
      alert('Upload failed: ' + err.message)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeMedia(idx) {
    setDrawer(prev => {
      const urls = [...(prev.mediaUrls || [])]
      urls.splice(idx, 1)
      return { ...prev, mediaUrls: urls, type: urls.length > 1 ? 'carousel' : urls.length === 1 && /\.(mp4|mov)$/i.test(urls[0]) ? 'reel' : 'image' }
    })
  }

  // ── AI Caption ─────────────────────────────────────────────────────────────

  async function handleGenerateCaption() {
    if (!drawer) return
    setGenerating(true)
    setCaptionVariants(null)
    try {
      const result = await generateCaptionAPI({
        postType: drawer.type,
        productContext: drawer.productContext || '',
        mediaDescription: drawer.mediaDescription || '',
      })
      if (result.variants) setCaptionVariants(result.variants)
    } catch (err) {
      alert('Caption generation failed: ' + err.message)
    }
    setGenerating(false)
  }

  function selectVariant(variant) {
    const caption = `${variant.hook}\n\n${variant.body}\n\n${variant.cta}\n\n${variant.hashtags}`
    setDrawer(prev => ({ ...prev, caption }))
    setCaptionVariants(null)
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────

  async function handleDisconnect() {
    if (!confirm('Disconnect Instagram? Scheduled posts will stop publishing.')) return
    await fetch(`${META_API}/disconnect`, { method: 'POST' })
    setConnection(false)
  }

  // ── Calendar view ──────────────────────────────────────────────────────────

  const calDays = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth])
  const postsByDate = useMemo(() => {
    const map = {}
    for (const p of posts) {
      const d = p.scheduledAt ? fmtDate(new Date(p.scheduledAt)) : null
      if (d) { if (!map[d]) map[d] = []; map[d].push(p) }
    }
    return map
  }, [posts])

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading && posts.length === 0 && connection === null) return <div className="loading"><div className="spinner" /></div>

  // Show connect panel if not connected
  if (connection === false) {
    return (
      <div className="ig-scheduler">
        <div className="page-header">
          <div>
            <h2 className="page-title">Instagram Scheduler</h2>
            <p className="page-sub">Connect your Instagram account to start auto-posting</p>
          </div>
        </div>
        <ConnectPanel onConnected={(data) => {
          setConnection({ connected: true, igUsername: data.igUsername, pageName: data.pageName })
          reload()
        }} />
      </div>
    )
  }

  const isConnected = connection && connection.connected

  return (
    <div className="ig-scheduler">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Instagram Scheduler</h2>
          <p className="page-sub">Drag videos onto a day to auto-schedule with AI captions</p>
        </div>
        <div className="page-actions">
          <div className="ig-view-toggle">
            <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>Calendar</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
          </div>
          <button className="btn btn-primary" onClick={() => newPost()}>+ New Post</button>
        </div>
      </div>

      {/* Connected account bar */}
      {isConnected && <AccountBar account={connection} onDisconnect={handleDisconnect} />}

      {/* Stats bar */}
      <div className="ig-stats">
        <div className="ig-stat"><span className="ig-stat-num">{stats.scheduled}</span><span className="ig-stat-label">Scheduled</span></div>
        <div className="ig-stat"><span className="ig-stat-num">{stats.published}</span><span className="ig-stat-label">Published</span></div>
        <div className="ig-stat"><span className="ig-stat-num">{stats.failed}</span><span className="ig-stat-label">Failed</span></div>
        <div className="ig-stat"><span className="ig-stat-num">{stats.thisWeek}</span><span className="ig-stat-label">This Week</span></div>
      </div>

      {/* Drag hint */}
      <div className="ig-drag-hint">Drag and drop video/image files onto any day to auto-schedule with AI captions</div>

      {/* Calendar View */}
      {view === 'calendar' && (
        <div className="ig-calendar">
          <div className="ig-cal-header">
            <button onClick={prevMonth}>&larr;</button>
            <h3>{new Date(calYear, calMonth).toLocaleString('en-AU', { month: 'long', year: 'numeric' })}</h3>
            <button onClick={nextMonth}>&rarr;</button>
          </div>
          <div className="ig-cal-weekdays">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="ig-cal-weekday">{d}</div>)}
          </div>
          <div className="ig-cal-grid">
            {calDays.map((day, i) => {
              const key = fmtDate(day)
              const isCurrentMonth = day.getMonth() === calMonth
              const isToday = key === fmtDate(new Date())
              const isDragTarget = dragOver === key
              const isProcessing = autoPosting === key
              const dayPosts = postsByDate[key] || []
              return (
                <div
                  key={i}
                  className={`ig-cal-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isDragTarget ? 'drag-over' : ''} ${isProcessing ? 'processing' : ''}`}
                  onClick={() => newPost(day)}
                  onDragOver={e => handleCalDragOver(e, day)}
                  onDragLeave={handleCalDragLeave}
                  onDrop={e => handleCalDrop(e, day)}
                >
                  <span className="ig-cal-day-num">{day.getDate()}</span>
                  {isProcessing && <div className="ig-cal-processing"><div className="spinner" /> Auto-posting...</div>}
                  <div className="ig-cal-day-posts">
                    {dayPosts.slice(0, 3).map(p => (
                      <div
                        key={p.id}
                        className="ig-cal-post-chip"
                        style={{ borderLeftColor: STATUS_COLORS[p.status] || '#9CA3AF' }}
                        onClick={e => { e.stopPropagation(); setDrawer(p); setCaptionVariants(null) }}
                      >
                        <span className="ig-cal-post-icon">{POST_TYPE_ICONS[p.type]}</span>
                        <span className="ig-cal-post-text">{p.caption ? p.caption.slice(0, 20) : p.status}</span>
                      </div>
                    ))}
                    {dayPosts.length > 3 && <span className="ig-cal-more">+{dayPosts.length - 3}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="ig-list">
          {posts.length === 0 && <div className="empty-state"><div className="empty-icon">📸</div><h3>No posts yet</h3><p>Drag a video onto the calendar or click + New Post.</p></div>}
          {posts.sort((a, b) => new Date(b.scheduledAt || b.createdAt) - new Date(a.scheduledAt || a.createdAt)).map(post => (
            <div key={post.id} className="ig-list-item" onClick={() => { setDrawer(post); setCaptionVariants(null) }}>
              <div className="ig-list-preview">
                {post.mediaUrls?.[0] ? (
                  /\.(mp4|mov)$/i.test(post.mediaUrls[0])
                    ? <video src={post.mediaUrls[0]} className="ig-list-thumb" />
                    : <img src={post.mediaUrls[0]} className="ig-list-thumb" alt="" />
                ) : <div className="ig-list-thumb ig-list-thumb-empty">{POST_TYPE_ICONS[post.type]}</div>}
              </div>
              <div className="ig-list-info">
                <div className="ig-list-caption">{post.caption ? post.caption.slice(0, 80) + (post.caption.length > 80 ? '...' : '') : 'No caption'}</div>
                <div className="ig-list-meta">
                  <span className="ig-badge" style={{ background: STATUS_COLORS[post.status] }}>{post.status}</span>
                  <span>{POST_TYPE_ICONS[post.type]} {POST_TYPE_LABELS[post.type]}</span>
                  <span>{fmtDateTime(post.scheduledAt)}</span>
                  {post.mediaUrls?.length > 1 && <span>{post.mediaUrls.length} media</span>}
                </div>
              </div>
              {post.error && <div className="ig-list-error" title={post.error}>!</div>}
            </div>
          ))}
        </div>
      )}

      {/* Drawer / Edit Panel */}
      {drawer && (
        <div className="ig-drawer-overlay" onClick={() => setDrawer(null)}>
          <div className="ig-drawer" onClick={e => e.stopPropagation()}>
            <div className="ig-drawer-header">
              <h3>{drawer.status === 'PUBLISHED' ? 'Published Post' : drawer.igPostId ? 'Edit Post' : 'New Post'}</h3>
              <button className="ig-drawer-close" onClick={() => setDrawer(null)}>&times;</button>
            </div>

            <div className="ig-drawer-body">
              {/* Post type */}
              <div className="ig-field">
                <label>Post Type</label>
                <div className="ig-type-picker">
                  {POST_TYPES.map(t => (
                    <button
                      key={t}
                      className={drawer.type === t ? 'active' : ''}
                      onClick={() => setDrawer(prev => ({ ...prev, type: t }))}
                    >
                      {POST_TYPE_ICONS[t]} {POST_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Media upload */}
              <div className="ig-field">
                <label>Media {drawer.type === 'carousel' ? '(2-10 images)' : drawer.type === 'reel' ? '(video)' : '(image)'}</label>
                <div className="ig-media-grid">
                  {(drawer.mediaUrls || []).map((url, idx) => (
                    <div key={idx} className="ig-media-item">
                      {/\.(mp4|mov)$/i.test(url)
                        ? <video src={url} className="ig-media-preview" controls />
                        : <img src={url} className="ig-media-preview" alt="" />}
                      <button className="ig-media-remove" onClick={() => removeMedia(idx)}>&times;</button>
                    </div>
                  ))}
                </div>
                <div className="ig-upload-btn-wrap">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*,.mp4,.mov,.jpg,.jpeg,.png,.webp"
                    multiple
                    onChange={handleUpload}
                    className="ig-upload-input"
                  />
                </div>
              </div>

              {/* Caption */}
              <div className="ig-field">
                <label>Caption</label>
                <textarea
                  className="ig-caption-input"
                  value={drawer.caption || ''}
                  onChange={e => setDrawer(prev => ({ ...prev, caption: e.target.value }))}
                  placeholder="Write your caption or use AI to generate one..."
                  rows={6}
                />
                <div className="ig-caption-meta">
                  <span className="muted">{(drawer.caption || '').length} chars</span>
                  <span className="muted">{((drawer.caption || '').match(/#\w+/g) || []).length} hashtags</span>
                </div>
              </div>

              {/* AI Caption Generator */}
              <div className="ig-field ig-ai-section">
                <label>AI Caption Generator</label>
                <div className="ig-ai-inputs">
                  <input
                    placeholder="Product context (e.g. Mega Blaster, Smoke Bombs)"
                    value={drawer.productContext || ''}
                    onChange={e => setDrawer(prev => ({ ...prev, productContext: e.target.value }))}
                  />
                  <input
                    placeholder="What does the media show? (optional)"
                    value={drawer.mediaDescription || ''}
                    onChange={e => setDrawer(prev => ({ ...prev, mediaDescription: e.target.value }))}
                  />
                </div>
                <button className="btn btn-secondary" onClick={handleGenerateCaption} disabled={generating}>
                  {generating ? 'Generating...' : 'Generate 3 Captions'}
                </button>

                {captionVariants && (
                  <div className="ig-variants">
                    {captionVariants.map((v, i) => (
                      <div key={i} className="ig-variant" onClick={() => selectVariant(v)}>
                        <div className="ig-variant-style">{v.style}</div>
                        <div className="ig-variant-hook">{v.hook}</div>
                        <div className="ig-variant-body">{v.body?.slice(0, 120)}...</div>
                        <button className="btn btn-sm">Use This</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div className="ig-field">
                <label>Schedule</label>
                <input
                  type="datetime-local"
                  value={drawer.scheduledAt ? new Date(new Date(drawer.scheduledAt).getTime() + 10 * 60 * 60 * 1000).toISOString().slice(0, 16) : ''}
                  onChange={e => {
                    const local = new Date(e.target.value)
                    const utc = new Date(local.getTime() - 10 * 60 * 60 * 1000)
                    setDrawer(prev => ({ ...prev, scheduledAt: utc.toISOString() }))
                  }}
                />
                <span className="muted">Time is in AEST (Gold Coast)</span>
              </div>

              {/* Error display */}
              {drawer.error && (
                <div className="ig-error-box">
                  <strong>Last Error:</strong> {drawer.error}
                  {drawer.attempts > 0 && <span className="muted"> (attempt {drawer.attempts}/3)</span>}
                </div>
              )}

              {/* Published info */}
              {drawer.status === 'PUBLISHED' && drawer.igPermalink && (
                <div className="ig-published-info">
                  Published {fmtDateTime(drawer.publishedAt)}
                  {' '}&mdash;{' '}
                  <a href={drawer.igPermalink} target="_blank" rel="noopener noreferrer">View on Instagram</a>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="ig-drawer-actions">
              {drawer.status !== 'PUBLISHED' && (
                <>
                  <button className="btn btn-primary" onClick={() => handleSave('SCHEDULED')} disabled={saving || !(drawer.mediaUrls?.length)}>
                    {saving ? 'Saving...' : 'Schedule'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleSave('DRAFT')} disabled={saving}>
                    Save Draft
                  </button>
                  {isConnected && drawer.mediaUrls?.length > 0 && (
                    <button className="btn btn-accent" onClick={handlePublishNow} disabled={saving}>
                      Publish Now
                    </button>
                  )}
                </>
              )}
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
