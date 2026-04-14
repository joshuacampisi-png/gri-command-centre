import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────

const POST_TYPES = ['image', 'carousel', 'reel']
const POST_TYPE_LABELS = { image: 'Image', carousel: 'Carousel', reel: 'Reel' }
const POST_TYPE_ICONS = { image: '🖼', carousel: '🎠', reel: '🎬' }
const STATUS_COLORS = { DRAFT: '#9CA3AF', SCHEDULED: '#3B82F6', PUBLISHING: '#F59E0B', PUBLISHED: '#059669', FAILED: '#DC2626' }
const API = '/api/instagram'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
// All dates in AEST (UTC+10) — never use browser local time
function nowAEST() { return new Date(Date.now() + 10 * 60 * 60 * 1000) }
function fmtDate(d) { const a = new Date(d.getTime() + 10 * 60 * 60 * 1000); return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}-${String(a.getUTCDate()).padStart(2, '0')}` }
function aestYear() { return nowAEST().getUTCFullYear() }
function aestMonth() { return nowAEST().getUTCMonth() }
function fmtDateTime(iso) { if (!iso) return ''; try { const d = new Date(iso); return d.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
function isVideo(url) { return /\.(mp4|mov)$/i.test(url || '') }
function fmtSize(bytes) { if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB' }

// ── API helpers ──────────────────────────────────────────────────────────────

async function fetchPosts() {
  try {
    const res = await fetch(`${API}/entries`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

async function savePost(post) {
  const res = await fetch(`${API}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(post) })
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(t || `Save failed (${res.status})`) }
  return res.json()
}

async function deletePostAPI(id) {
  await fetch(`${API}/entries/${id}`, { method: 'DELETE' })
}

async function publishNowAPI(id) {
  const res = await fetch(`${API}/entries/${id}/publish-now`, { method: 'POST' })
  return res.json()
}

async function uploadMediaAPI(files, onProgress) {
  const form = new FormData()
  for (const file of files) form.append('media', file)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/upload`)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)) }
        catch { reject(new Error('Invalid response from server')) }
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText?.slice(0, 200) || ''}`))
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed — network error'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))
    xhr.timeout = 300000 // 5 min timeout for large videos
    xhr.send(form)
  })
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

// ── Toast Component ─────────────────────────────────────────────────────────

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 9999, maxWidth: 400,
      padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
      background: type === 'error' ? '#FEE2E2' : type === 'warning' ? '#FEF3C7' : '#ECFDF5',
      color: type === 'error' ? '#991B1B' : type === 'warning' ? '#92400E' : '#065F46',
      border: `1px solid ${type === 'error' ? '#FECACA' : type === 'warning' ? '#FCD34D' : '#A7F3D0'}`,
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)', animation: 'igSlideIn .2s ease-out',
    }}>
      {message}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function InstagramScheduler() {
  const [posts, setPosts] = useState([])
  const [view, setView] = useState('calendar')
  const [drawer, setDrawer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [captionVariants, setCaptionVariants] = useState(null)
  const [calMonth, setCalMonth] = useState(aestMonth())
  const [calYear, setCalYear] = useState(aestYear())
  const [dragOver, setDragOver] = useState(null)
  const [autoPosting, setAutoPosting] = useState(null)
  const [toast, setToast] = useState(null)
  const [scheduleInput, setScheduleInput] = useState('')
  const [diskUsage, setDiskUsage] = useState(null)
  const [cleaning, setCleaning] = useState(false)
  const fileRef = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() })
  }, [])

  // Convert UTC ISO to AEST display string for the datetime-local input
  const isoToAESTInput = useCallback((iso) => {
    if (!iso) return ''
    try {
      const utcMs = new Date(iso).getTime()
      if (isNaN(utcMs)) return ''
      const aestMs = utcMs + 10 * 60 * 60 * 1000
      const aest = new Date(aestMs)
      const y = aest.getUTCFullYear()
      const mo = String(aest.getUTCMonth() + 1).padStart(2, '0')
      const d = String(aest.getUTCDate()).padStart(2, '0')
      const h = String(aest.getUTCHours()).padStart(2, '0')
      const mi = String(aest.getUTCMinutes()).padStart(2, '0')
      return `${y}-${mo}-${d}T${h}:${mi}`
    } catch { return '' }
  }, [])

  // Sync scheduleInput whenever drawer opens or changes externally
  useEffect(() => {
    if (drawer?.scheduledAt) {
      setScheduleInput(isoToAESTInput(drawer.scheduledAt))
    } else {
      setScheduleInput('')
    }
  }, [drawer?.id, drawer?.scheduledAt, isoToAESTInput])

  const reload = useCallback(async () => {
    try {
      const data = await fetchPosts()
      setPosts(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDiskUsage = useCallback(() => {
    fetch(`${API}/disk-usage`).then(r => r.json()).then(d => {
      if (d.ok) setDiskUsage(d)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    reload()
    fetchDiskUsage()
    const interval = setInterval(reload, 30000)
    return () => clearInterval(interval)
  }, [reload, fetchDiskUsage])

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
    const dayKey = date ? fmtDate(date) : fmtDate(new Date())
    const existingPosts = postsByDate[dayKey] || []

    // If day already has posts, ask if they want to add another
    if (existingPosts.length > 0) {
      const action = window.confirm(
        `This day already has ${existingPosts.length} post${existingPosts.length > 1 ? 's' : ''}.\n\nClick OK to add another post, or Cancel to view existing.`
      )
      if (!action) {
        // Open the first existing post instead
        setDrawer(existingPosts[0])
        setCaptionVariants(null)
        return
      }
    }

    // Stagger time: 10am for 1st post, 2pm for 2nd, 6pm for 3rd (AEST)
    const hourOffsets = [0, 4, 8] // hours after 10am AEST (00:00 UTC)
    const offset = hourOffsets[Math.min(existingPosts.length, hourOffsets.length - 1)]
    const scheduledAtUTC = new Date(`${dayKey}T${String(offset).padStart(2, '0')}:00:00.000Z`)

    setDrawer({
      id: uid(),
      type: 'image',
      mediaUrls: [],
      caption: '',
      scheduledAt: scheduledAtUTC.toISOString(),
      status: 'DRAFT',
      productContext: '',
      mediaDescription: '',
    })
    setCaptionVariants(null)
  }

  // ── Drag & drop onto calendar day ──────────────────────────────────────────

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
      const uploadResult = await uploadMediaAPI(files, (pct) => setUploadProgress(pct))
      if (!uploadResult.files?.length) throw new Error('Upload returned no files')

      const mediaUrls = uploadResult.files.map(f => f.url)
      const hasVideo = uploadResult.files.some(f => f.type === 'video')
      const postType = mediaUrls.length > 1 ? 'carousel' : hasVideo ? 'reel' : 'image'

      let caption = ''
      try {
        const captionResult = await generateCaptionAPI({ postType })
        if (captionResult.variants?.[0]) {
          const v = captionResult.variants[0]
          caption = `${v.hook}\n\n${v.body}\n\n${v.cta}\n\n${v.hashtags}`
        }
      } catch { /* Non-fatal */ }

      // Stagger times: 10am, 2pm, 6pm AEST for multiple posts on same day
      const dayKey = fmtDate(day)
      const existingPosts = postsByDate[dayKey] || []
      const hourOffsets = [0, 4, 8]
      const offset = hourOffsets[Math.min(existingPosts.length, hourOffsets.length - 1)]
      const scheduledAtUTC = new Date(`${dayKey}T${String(offset).padStart(2, '0')}:00:00.000Z`)
      const post = {
        id: uid(),
        type: postType,
        mediaUrls,
        caption,
        scheduledAt: scheduledAtUTC.toISOString(),
        status: 'SCHEDULED',
      }
      await savePost(post)
      await reload()
      showToast(`Post scheduled for ${fmtDate(day)}`)
    } catch (err) {
      showToast('Auto-post failed: ' + err.message, 'error')
    }
    setAutoPosting(null)
    setUploadProgress(0)
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
      showToast(status === 'SCHEDULED' ? 'Post scheduled' : 'Draft saved')
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error')
    }
    setSaving(false)
  }

  // ── Delete post ────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!drawer || !confirm('Delete this post?')) return
    try {
      await deletePostAPI(drawer.id)
      await reload()
      fetchDiskUsage()
      setDrawer(null)
      showToast('Post deleted — media files removed')
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error')
    }
  }

  async function handleCleanupMedia() {
    setCleaning(true)
    try {
      const res = await fetch(`${API}/cleanup-media`, { method: 'POST' })
      const d = await res.json()
      if (d.ok) {
        showToast(`Cleaned up ${d.deleted} orphaned file${d.deleted !== 1 ? 's' : ''} — freed ${d.freedMB}MB`)
        fetchDiskUsage()
      }
    } catch (err) {
      showToast('Cleanup failed: ' + err.message, 'error')
    }
    setCleaning(false)
  }

  // ── Publish now ────────────────────────────────────────────────────────────

  async function handlePublishNow() {
    if (!drawer || !confirm('Publish this post to Instagram right now?')) return
    setSaving(true)
    try {
      await savePost(drawer)
      const result = await publishNowAPI(drawer.id)
      if (result.error) {
        showToast('Publish failed: ' + result.error, 'error')
      } else {
        showToast('Published to Instagram!')
      }
      await reload()
      setDrawer(null)
    } catch (err) {
      showToast('Publish failed: ' + err.message, 'error')
    }
    setSaving(false)
  }

  // ── Media upload (drawer) ─────────────────────────────────────────────────

  async function handleUpload(e) {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Validate file sizes
    for (const f of files) {
      if (f.size > 500 * 1024 * 1024) {
        showToast(`File "${f.name}" is too large (max 500MB)`, 'error')
        if (fileRef.current) fileRef.current.value = ''
        return
      }
    }

    setUploading(true)
    setUploadProgress(0)
    try {
      const result = await uploadMediaAPI(files, (pct) => setUploadProgress(pct))
      if (result.files) {
        setDrawer(prev => {
          if (!prev) return prev
          const newUrls = [...(prev.mediaUrls || []), ...result.files.map(f => f.url)]
          const hasMultiple = newUrls.length > 1
          const hasVid = result.files.some(f => f.type === 'video') || newUrls.some(u => isVideo(u))
          return {
            ...prev,
            mediaUrls: newUrls,
            type: hasMultiple ? 'carousel' : hasVid ? 'reel' : prev.type,
          }
        })
        showToast(`${result.files.length} file${result.files.length > 1 ? 's' : ''} uploaded`)
      }
    } catch (err) {
      const msg = err.message || 'Upload failed'
      showToast(msg.includes('Disk full') || msg.includes('no space')
        ? 'Disk full — delete old posts to free space'
        : 'Upload failed: ' + msg, 'error')
    }
    setUploading(false)
    setUploadProgress(0)
    fetchDiskUsage()
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeMedia(idx) {
    setDrawer(prev => {
      if (!prev) return prev
      const urls = [...(prev.mediaUrls || [])]
      urls.splice(idx, 1)
      return {
        ...prev,
        mediaUrls: urls,
        type: urls.length > 1 ? 'carousel' : urls.length === 1 && isVideo(urls[0]) ? 'reel' : 'image',
      }
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
      showToast('Caption generation failed: ' + err.message, 'error')
    }
    setGenerating(false)
  }

  function selectVariant(variant) {
    const caption = `${variant.hook}\n\n${variant.body}\n\n${variant.cta}\n\n${variant.hashtags}`
    setDrawer(prev => prev ? { ...prev, caption } : prev)
    setCaptionVariants(null)
    showToast('Caption applied')
  }

  // ── Calendar view ──────────────────────────────────────────────────────────

  const calDays = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth])
  const postsByDate = useMemo(() => {
    const map = {}
    for (const p of posts) {
      try {
        const d = p.scheduledAt ? fmtDate(new Date(p.scheduledAt)) : null
        if (d) { if (!map[d]) map[d] = []; map[d].push(p) }
      } catch { /* skip bad date */ }
    }
    return map
  }, [posts])

  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => new Date(b.scheduledAt || b.createdAt || 0) - new Date(a.scheduledAt || a.createdAt || 0))
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

  if (loading && posts.length === 0) {
    return (
      <div className="ig-scheduler">
        <div className="loading"><div className="spinner" /> Loading Instagram scheduler...</div>
      </div>
    )
  }

  if (error && posts.length === 0) {
    return (
      <div className="ig-scheduler">
        <div className="ig-error-box">
          <strong>Failed to load:</strong> {error}
          <button className="btn btn-secondary" onClick={reload} style={{ marginLeft: 12 }}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="ig-scheduler">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} key={toast.key} />}

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

      {/* Account bar */}
      <div className="ig-account-bar">
        <div className="ig-account-info">
          <span className="ig-account-dot" />
          <strong>@gender.reveal.ideass</strong>
          <span className="muted"> via Gender Reveal Ideas</span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="ig-stats">
        <div className="ig-stat"><span className="ig-stat-num">{stats.scheduled}</span><span className="ig-stat-label">Scheduled</span></div>
        <div className="ig-stat"><span className="ig-stat-num">{stats.published}</span><span className="ig-stat-label">Published</span></div>
        <div className="ig-stat"><span className="ig-stat-num">{stats.failed}</span><span className="ig-stat-label">Failed</span></div>
        <div className="ig-stat"><span className="ig-stat-num">{stats.thisWeek}</span><span className="ig-stat-label">This Week</span></div>
      </div>

      {/* Disk usage bar */}
      {diskUsage && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
          background: diskUsage.mb > 800 ? '#FEF2F2' : '#F8FAFC',
          borderRadius: 10, margin: '0 0 8px', fontSize: 12,
        }}>
          <span style={{ fontWeight: 600, color: diskUsage.mb > 800 ? '#DC2626' : '#64748B' }}>
            Storage: {diskUsage.mb}MB used ({diskUsage.files} files)
          </span>
          <div style={{ flex: 1, height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, transition: 'width .3s',
              width: `${Math.min((diskUsage.mb / 1000) * 100, 100)}%`,
              background: diskUsage.mb > 800 ? '#DC2626' : diskUsage.mb > 500 ? '#F59E0B' : '#059669',
            }} />
          </div>
          <span style={{ color: '#94A3B8', fontSize: 11 }}>1GB</span>
          <button onClick={handleCleanupMedia} disabled={cleaning}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            {cleaning ? 'Cleaning...' : 'Free Space'}
          </button>
        </div>
      )}

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
              const todayKey = `${nowAEST().getUTCFullYear()}-${String(nowAEST().getUTCMonth() + 1).padStart(2, '0')}-${String(nowAEST().getUTCDate()).padStart(2, '0')}`
              const isToday = key === todayKey
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
                  {isProcessing && (
                    <div className="ig-cal-processing">
                      <div className="spinner" />
                      {uploadProgress > 0 && uploadProgress < 100 ? `Uploading ${uploadProgress}%...` : 'Processing...'}
                    </div>
                  )}
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
          {sortedPosts.map(post => (
            <div key={post.id} className="ig-list-item" onClick={() => { setDrawer(post); setCaptionVariants(null) }}>
              <div className="ig-list-preview">
                {post.mediaUrls?.[0] ? (
                  isVideo(post.mediaUrls[0])
                    ? <div className="ig-list-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1E293B', color: '#fff', fontSize: 20 }}>🎬</div>
                    : <img src={post.mediaUrls[0]} className="ig-list-thumb" alt="" loading="lazy" onError={e => { e.target.style.display = 'none' }} />
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
        <div className="ig-drawer-overlay" onClick={() => { if (!saving && !uploading) setDrawer(null) }}>
          <div className="ig-drawer" onClick={e => e.stopPropagation()}>
            <div className="ig-drawer-header">
              <h3>{drawer.status === 'PUBLISHED' ? 'Published Post' : drawer.igPostId ? 'Edit Post' : 'New Post'}</h3>
              <button className="ig-drawer-close" onClick={() => { if (!saving && !uploading) setDrawer(null) }}>&times;</button>
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
                      onClick={() => setDrawer(prev => prev ? { ...prev, type: t } : prev)}
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
                      {isVideo(url)
                        ? (
                          <div className="ig-media-preview" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1E293B', color: '#fff', fontSize: 28 }}>
                            🎬
                            <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 9, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>VIDEO</span>
                          </div>
                        )
                        : <img src={url} className="ig-media-preview" alt="" loading="lazy" onError={e => { e.target.style.opacity = '0.3' }} />
                      }
                      <button className="ig-media-remove" onClick={() => removeMedia(idx)}>&times;</button>
                    </div>
                  ))}
                </div>

                {/* Upload area */}
                <div className="ig-upload-btn-wrap">
                  {uploading ? (
                    <div style={{
                      padding: 16, border: '2px solid #E43F7B', borderRadius: 10,
                      background: '#FFF0F5', textAlign: 'center',
                    }}>
                      <div className="spinner" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#E43F7B' }}>
                        Uploading... {uploadProgress > 0 ? `${uploadProgress}%` : ''}
                      </div>
                      {uploadProgress > 0 && (
                        <div style={{
                          height: 4, background: '#FCE7F3', borderRadius: 2, marginTop: 8, overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', width: `${uploadProgress}%`, background: '#E43F7B',
                            borderRadius: 2, transition: 'width 0.3s ease',
                          }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.mp4,.mov"
                      multiple
                      onChange={handleUpload}
                      className="ig-upload-input"
                    />
                  )}
                </div>
              </div>

              {/* Caption */}
              <div className="ig-field">
                <label>Caption</label>
                <textarea
                  className="ig-caption-input"
                  value={drawer.caption || ''}
                  onChange={e => setDrawer(prev => prev ? { ...prev, caption: e.target.value } : prev)}
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
                    onChange={e => setDrawer(prev => prev ? { ...prev, productContext: e.target.value } : prev)}
                  />
                  <input
                    placeholder="What does the media show? (optional)"
                    value={drawer.mediaDescription || ''}
                    onChange={e => setDrawer(prev => prev ? { ...prev, mediaDescription: e.target.value } : prev)}
                  />
                </div>
                <button className="btn btn-secondary" onClick={handleGenerateCaption} disabled={generating} style={{ marginTop: 8 }}>
                  {generating ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      Generating...
                    </span>
                  ) : 'Generate 3 Captions'}
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
                <label>Schedule (AEST)</label>
                <input
                  type="datetime-local"
                  value={scheduleInput}
                  onChange={e => {
                    const raw = e.target.value
                    setScheduleInput(raw)
                    // Only commit to drawer state when we have a full valid datetime
                    if (raw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
                      try {
                        const asUtc = new Date(raw + ':00.000Z')
                        if (!isNaN(asUtc.getTime())) {
                          const realUtc = new Date(asUtc.getTime() - 10 * 60 * 60 * 1000)
                          setDrawer(prev => prev ? { ...prev, scheduledAt: realUtc.toISOString() } : prev)
                        }
                      } catch { /* ignore partial input */ }
                    }
                  }}
                  onBlur={() => {
                    // On blur, if the input is incomplete/invalid, reset to the last good value
                    if (scheduleInput && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleInput)) {
                      setScheduleInput(isoToAESTInput(drawer.scheduledAt))
                    }
                  }}
                />
                <span className="muted">Gold Coast time (AEST UTC+10)</span>
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
                  <button className="btn btn-primary" onClick={() => handleSave('SCHEDULED')} disabled={saving || uploading || !(drawer.mediaUrls?.length)}>
                    {saving ? 'Saving...' : 'Schedule'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleSave('DRAFT')} disabled={saving || uploading}>
                    Save Draft
                  </button>
                  {drawer.mediaUrls?.length > 0 && (
                    <button className="btn btn-accent" onClick={handlePublishNow} disabled={saving || uploading}>
                      Publish Now
                    </button>
                  )}
                </>
              )}
              <button className="btn btn-danger" onClick={handleDelete} disabled={saving || uploading}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
