import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const BRANDS = ['Gender Reveal Ideas', 'LionZen']
const PLATFORMS = ['Instagram Reels', 'TikTok', 'Facebook', 'YouTube Shorts']
const STATUSES = ['Draft', 'Scheduled', 'Published', 'Paused']
const STATUS_COLORS = { Draft: '#9CA3AF', Scheduled: '#3B82F6', Published: '#22C55E', Paused: '#F59E0B' }
const AD_STATUSES = ['Scheduled', 'Live', 'Scaling', 'Paused']
const AD_STATUS_COLORS = { Scheduled: '#9CA3AF', Live: '#059669', Scaling: '#7C3AED', Paused: '#DC2626' }
const AD_STATUS_BG = { Scheduled: '#E5E7EB', Live: '#D1FAE5', Scaling: '#EDE9FE', Paused: '#FEE2E2' }
const BRAND_COLORS = { 'Gender Reveal Ideas': '#EC4899', 'LionZen': '#14B8A6' }
const PLATFORM_ICONS = { 'Instagram Reels': '📸', 'TikTok': '🎵', 'Facebook': '📘', 'YouTube Shorts': '▶️' }
const ACCEPT_MEDIA = '.mp4,.mov,.webm,.jpg,.jpeg,.png,.gif,.webp'
const VIDEO_EXTS = ['mp4', 'mov', 'webm']
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp']

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
function fmtDate(d) { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }
function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB' }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

const API = '/api/calendar'

async function fetchEntries() {
  const res = await fetch(`${API}/entries`)
  return res.ok ? res.json() : []
}

async function saveEntry(entry) {
  const res = await fetch(`${API}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) })
  if (!res.ok) throw new Error(`Save failed: ${res.status}`)
  return res.json()
}

async function deleteEntryAPI(id) {
  await fetch(`${API}/entries/${id}`, { method: 'DELETE' })
}

async function bulkStatusAPI(ids, status) {
  await fetch(`${API}/entries/bulk-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status }) })
}

async function bulkDeleteAPI(ids) {
  await fetch(`${API}/entries/bulk-delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
}

async function uploadVideo(file) {
  const form = new FormData()
  form.append('video', file)
  const res = await fetch(`${API}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

async function deleteVideo(url) {
  if (!url) return
  const filename = url.split('/').pop()
  await fetch(`${API}/video/${filename}`, { method: 'DELETE' }).catch(() => {})
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekDays(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const mon = new Date(now)
  mon.setDate(now.getDate() - ((day + 6) % 7) + offset * 7)
  mon.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

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

function grabThumbnail(file) {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    video.src = url
    video.onloadeddata = () => {
      video.currentTime = 1
    }
    video.onseeked = () => {
      const c = document.createElement('canvas')
      c.width = video.videoWidth
      c.height = video.videoHeight
      c.getContext('2d').drawImage(video, 0, 0)
      resolve(c.toDataURL('image/jpeg', 0.7))
      URL.revokeObjectURL(url)
    }
    video.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
  })
}

// ── Video Preview Modal ───────────────────────────────────────────────────────

function MediaModal({ url, type, onClose }) {
  if (!url) return null
  const isImage = type === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(url)
  return (
    <div className="cc-modal-overlay" onClick={onClose}>
      <div className="cc-modal" onClick={e => e.stopPropagation()}>
        <button className="cc-modal-close" onClick={onClose}>&#10005;</button>
        {isImage
          ? <img src={url} alt="" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }} />
          : <video src={url} controls autoPlay style={{ width: '100%', maxHeight: '70vh', borderRadius: 8 }} />
        }
      </div>
    </div>
  )
}

// ── Entry Drawer ──────────────────────────────────────────────────────────────

function EntryDrawer({ entry, isNew, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(entry || {
    id: uid(), brand: BRANDS[0], platform: PLATFORMS[0], date: fmtDate(new Date()),
    time: '09:00', caption: '', hook: '', cta: '', status: 'Draft', notes: '',
    videoName: '', videoSize: 0, thumbnail: null, videoUrl: null, mediaType: null
  })
  const [videoPreview, setVideoPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const fileRef = useRef()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleDrop = async (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    const isVideo = VIDEO_EXTS.includes(ext)
    const isImage = IMAGE_EXTS.includes(ext)
    if (!isVideo && !isImage) return
    const localThumb = isVideo ? await grabThumbnail(file) : URL.createObjectURL(file)
    setForm(f => ({ ...f, videoName: file.name, videoSize: file.size, thumbnail: localThumb, mediaType: isVideo ? 'video' : 'image' }))
    setUploading(true)
    setUploadDone(false)
    try {
      const data = await uploadVideo(file)
      // Use the server URL as thumbnail for images (avoids huge base64 in JSON)
      const serverThumb = isImage ? data.url : (isVideo ? localThumb : data.url)
      setForm(f => ({ ...f, videoUrl: data.url, videoSize: data.size, thumbnail: serverThumb, mediaType: data.type || (isVideo ? 'video' : 'image') }))
      setUploadDone(true)
      setTimeout(() => setUploadDone(false), 3000)
    } catch { setForm(f => ({ ...f, videoName: '', videoSize: 0, thumbnail: null, mediaType: null })) }
    setUploading(false)
  }

  const [saving, setSaving] = useState(false)
  const handleSubmit = async () => {
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      alert('Failed to save entry. Please try again.')
    }
    setSaving(false)
  }

  return (
    <div className="cc-drawer-overlay" onClick={onClose}>
      <div className="cc-drawer" onClick={e => e.stopPropagation()}>
        <div className="cc-drawer-head">
          <h3>{isNew ? 'New Entry' : 'Edit Entry'}</h3>
          <button className="cc-drawer-x" onClick={onClose}>✕</button>
        </div>
        <div className="cc-drawer-body">
          <div className="cc-field-row">
            <label className="cc-field">
              <span>Brand</span>
              <select value={form.brand} onChange={e => set('brand', e.target.value)}>
                {BRANDS.map(b => <option key={b}>{b}</option>)}
              </select>
            </label>
            <label className="cc-field">
              <span>Platform</span>
              <select value={form.platform} onChange={e => set('platform', e.target.value)}>
                {PLATFORMS.map(p => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <div className="cc-field-row">
            <label className="cc-field">
              <span>Post Date</span>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </label>
            <label className="cc-field">
              <span>Post Time</span>
              <input type="time" value={form.time} onChange={e => set('time', e.target.value)} />
            </label>
          </div>
          <div className="cc-field-row">
            <label className="cc-field">
              <span>Content Status</span>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="cc-field">
              <span>Ad Status</span>
              <select value={form.adStatus || ''} onChange={e => set('adStatus', e.target.value)}>
                <option value="">None</option>
                {AD_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="cc-field">
            <span>Hook</span>
            <input type="text" value={form.hook} onChange={e => set('hook', e.target.value)} placeholder="Attention-grabbing hook line" />
          </label>
          <label className="cc-field">
            <span>Caption</span>
            <textarea rows={3} value={form.caption} onChange={e => set('caption', e.target.value)} placeholder="Post caption..." />
          </label>
          <label className="cc-field">
            <span>Call to Action</span>
            <input type="text" value={form.cta} onChange={e => set('cta', e.target.value)} placeholder="e.g. Shop now, Link in bio" />
          </label>

          {/* Media drop zone */}
          <div
            className="cc-dropzone"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !uploading && fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept={ACCEPT_MEDIA} hidden onChange={handleDrop} />
            {uploading ? (
              <div className="cc-drop-prompt">
                <span className="cc-drop-icon">&#9203;</span>
                <span>Uploading...</span>
              </div>
            ) : form.thumbnail ? (
              <div className="cc-thumb-row">
                <img src={form.thumbnail} alt="" className="cc-thumb" />
                <div className="cc-thumb-meta">
                  <span className="cc-thumb-name">{form.videoName}</span>
                  <span className="cc-thumb-size">{fmtSize(form.videoSize)}</span>
                  {uploadDone && <span className="cc-upload-done">Upload Complete</span>}
                  {form.videoUrl && (
                    <>
                      <button className="cc-play-btn" onClick={e => { e.stopPropagation(); setVideoPreview(form.videoUrl) }}>{form.mediaType === 'video' ? '\u25B6 Preview' : '\uD83D\uDD0D View'}</button>
                      <a className="cc-play-btn" href={form.videoUrl} download={form.videoName || true} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none' }}>&#11015; Download</a>
                    </>
                  )}
                </div>
                <button className="cc-remove-vid" onClick={e => { e.stopPropagation(); deleteVideo(form.videoUrl); set('thumbnail', null); set('videoUrl', null); set('videoName', ''); set('videoSize', 0); set('mediaType', null) }}>&#10005;</button>
              </div>
            ) : (
              <div className="cc-drop-prompt">
                <span className="cc-drop-icon">&#127916;</span>
                <span>Drop video or image here, or click to browse</span>
              </div>
            )}
          </div>

          <label className="cc-field">
            <span>R6 Ad Notes</span>
            <textarea rows={3} value={form.adNotes || ''} onChange={e => set('adNotes', e.target.value)} placeholder="Ad performance notes... Was this ad successful or not? Key learnings..." />
          </label>
          <label className="cc-field">
            <span>Notes</span>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." />
          </label>
        </div>
        <div className="cc-drawer-foot">
          {entry && <button className="cc-btn cc-btn-danger" onClick={() => { onDelete(entry.id); onClose() }}>Delete</button>}
          <div style={{ flex: 1 }} />
          <button className="btn-sec" onClick={onClose}>Cancel</button>
          <button className="cc-btn cc-btn-save" onClick={handleSubmit} disabled={saving || uploading}>{uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save'}</button>
        </div>
        <MediaModal url={videoPreview} onClose={() => setVideoPreview(null)} />
      </div>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

function EntryCard({ entry, onClick, onDragStart }) {
  return (
    <div
      className="cc-card"
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', entry.id); onDragStart?.(entry.id) }}
      onClick={() => onClick(entry)}
    >
      {entry.thumbnail && <img src={entry.thumbnail} alt="" className="cc-card-thumb" />}
      <div className="cc-card-info">
        <div className="cc-card-top">
          <span className="cc-brand-dot" style={{ background: BRAND_COLORS[entry.brand] || '#888' }} />
          <span className="cc-platform-icon">{PLATFORM_ICONS[entry.platform] || '📱'}</span>
          <span className="cc-card-time">{entry.time}</span>
        </div>
        {(entry.hook || entry.caption) && <div className="cc-card-hook">{entry.hook || entry.caption}</div>}
        <div className="cc-card-top">
          <span className="cc-status-pill" style={{ background: STATUS_COLORS[entry.status] + '22', color: STATUS_COLORS[entry.status], border: `1px solid ${STATUS_COLORS[entry.status]}44` }}>{entry.status}</span>
          {entry.videoUrl && <a className="cc-card-dl" href={entry.videoUrl} download onClick={e => e.stopPropagation()}>&#11015; Download</a>}
        </div>
      </div>
    </div>
  )
}

// ── Week View ─────────────────────────────────────────────────────────────────

function WeekView({ entries, weekOffset, setWeekOffset, onClickEntry, onClickDay, onReschedule }) {
  const days = getWeekDays(weekOffset)
  const today = fmtDate(new Date())
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const handleDrop = (e, dayStr) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id) onReschedule(id, dayStr)
  }

  return (
    <div className="cc-week">
      <div className="cc-week-nav">
        <button className="btn-sec" onClick={() => setWeekOffset(o => o - 1)}>← Prev</button>
        <button className="btn-sec" onClick={() => setWeekOffset(0)}>Today</button>
        <button className="btn-sec" onClick={() => setWeekOffset(o => o + 1)}>Next →</button>
      </div>
      <div className="cc-week-grid">
        {days.map((d, i) => {
          const ds = fmtDate(d)
          const dayEntries = entries.filter(e => e.date === ds)
          const isToday = ds === today
          return (
            <div
              key={ds}
              className={`cc-week-col ${isToday ? 'cc-today' : ''}`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, ds)}
              onClick={e => { if (e.target === e.currentTarget || e.target.classList.contains('cc-week-body')) onClickDay(ds) }}
            >
              <div className="cc-week-head">
                <span className="cc-day-name">{dayNames[i]}</span>
                <span className={`cc-day-num ${isToday ? 'cc-today-num' : ''}`}>{d.getDate()}</span>
              </div>
              <div className="cc-week-body">
                {dayEntries.sort((a, b) => a.time.localeCompare(b.time)).map(entry => (
                  <EntryCard key={entry.id} entry={entry} onClick={onClickEntry} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Month View ────────────────────────────────────────────────────────────────

function MonthView({ entries, onClickEntry, onClickDay }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [sideDate, setSideDate] = useState(null)
  const days = getMonthDays(year, month)
  const today = fmtDate(new Date())
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const monthName = new Date(year, month).toLocaleString('en-AU', { month: 'long', year: 'numeric' })

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const sideEntries = sideDate ? entries.filter(e => e.date === sideDate).sort((a, b) => a.time.localeCompare(b.time)) : []

  return (
    <div className="cc-month-wrap">
      <div className={`cc-month ${sideDate ? 'cc-month-shrunk' : ''}`}>
        <div className="cc-month-nav">
          <button className="btn-sec" onClick={prev}>← Prev</button>
          <span className="cc-month-label">{monthName}</span>
          <button className="btn-sec" onClick={next}>Next →</button>
        </div>
        <div className="cc-month-grid">
          {dayNames.map(n => <div key={n} className="cc-month-hdr">{n}</div>)}
          {days.map(d => {
            const ds = fmtDate(d)
            const isMonth = d.getMonth() === month
            const isToday = ds === today
            const dayEntries = entries.filter(e => e.date === ds)
            return (
              <div
                key={ds}
                className={`cc-month-cell ${!isMonth ? 'cc-out' : ''} ${isToday ? 'cc-today' : ''}`}
                onClick={() => { if (dayEntries.length) setSideDate(ds); else onClickDay(ds) }}
              >
                <span className={`cc-month-num ${isToday ? 'cc-today-num' : ''}`}>{d.getDate()}</span>
                {dayEntries.length > 0 && <span className="cc-month-badge">{dayEntries.length}</span>}
                {dayEntries.slice(0, 2).map(e => (
                  <div key={e.id} className="cc-month-mini" onClick={ev => { ev.stopPropagation(); onClickEntry(e) }}>
                    <span className="cc-brand-dot" style={{ background: BRAND_COLORS[e.brand] }} />
                    <span className="cc-platform-icon-sm">{PLATFORM_ICONS[e.platform]}</span>
                    <span className="cc-mini-time">{e.time}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      {sideDate && (
        <div className="cc-side-panel">
          <div className="cc-side-head">
            <h4>{parseDate(sideDate).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
            <button className="cc-drawer-x" onClick={() => setSideDate(null)}>✕</button>
          </div>
          <div className="cc-side-body">
            {sideEntries.map(e => <EntryCard key={e.id} entry={e} onClick={onClickEntry} />)}
            <button className="btn-sec cc-side-add" onClick={() => { onClickDay(sideDate); setSideDate(null) }}>+ Add entry</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── List View ─────────────────────────────────────────────────────────────────

function ListView({ entries, onClickEntry, onBulkAction, onUpdateEntry }) {
  const [selected, setSelected] = useState(new Set())
  const [brandFilter, setBrandFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [adFilter, setAdFilter] = useState('')

  const filtered = useMemo(() => {
    let list = [...entries]
    if (brandFilter) list = list.filter(e => e.brand === brandFilter)
    if (statusFilter) list = list.filter(e => e.status === statusFilter)
    if (adFilter) list = list.filter(e => e.adStatus === adFilter)
    return list.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
  }, [entries, brandFilter, statusFilter, adFilter])

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(e => e.id)))
  }
  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="cc-list">
      <div className="cc-list-filters">
        <select className="select" value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
          <option value="">All Brands</option>
          {BRANDS.map(b => <option key={b}>{b}</option>)}
        </select>
        <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" value={adFilter} onChange={e => setAdFilter(e.target.value)}>
          <option value="">All Ad Statuses</option>
          {AD_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="cc-table-wrap">
        <table className="cc-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
              <th>Date</th><th>Brand</th><th>Platform</th><th>Hook / Caption</th><th>Status</th><th>Preview</th><th>Ad Status</th><th style={{ minWidth: 180 }}>R6 Ad Notes</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 24 }}>No content yet. Click + New Entry to add your first piece.</td></tr>}
            {filtered.map(e => (
              <tr key={e.id} className={selected.has(e.id) ? 'cc-row-sel' : ''} onClick={() => onClickEntry(e)}>
                <td onClick={ev => ev.stopPropagation()}><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                <td><span className="cc-brand-dot" style={{ background: BRAND_COLORS[e.brand] }} />{e.brand}</td>
                <td>{PLATFORM_ICONS[e.platform]} {e.platform}</td>
                <td className="cc-hook-cell">{e.hook || e.caption || '—'}</td>
                <td><span className="cc-status-pill" style={{ background: STATUS_COLORS[e.status] + '22', color: STATUS_COLORS[e.status], border: `1px solid ${STATUS_COLORS[e.status]}44` }}>{e.status}</span></td>
                <td onClick={ev => ev.stopPropagation()}>
                  {e.thumbnail ? <img src={e.thumbnail} className="cc-list-thumb" alt="" /> : '—'}
                  {e.videoUrl && <a className="cc-dl-link" href={e.videoUrl} download>⬇</a>}
                </td>
                <td onClick={ev => ev.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {AD_STATUSES.map(s => (
                      <button key={s} onClick={() => onUpdateEntry({ ...e, adStatus: e.adStatus === s ? '' : s })}
                        style={{
                          border: 'none', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', transition: 'all .15s',
                          background: AD_STATUS_BG[s], color: AD_STATUS_COLORS[s],
                          opacity: e.adStatus === s ? 1 : 0.35,
                          boxShadow: e.adStatus === s ? '0 1px 4px rgba(0,0,0,0.15)' : 'none'
                        }}>{s}</button>
                    ))}
                  </div>
                </td>
                <td onClick={ev => ev.stopPropagation()}>
                  <textarea
                    defaultValue={e.adNotes || ''}
                    placeholder="Ad notes..."
                    onBlur={ev => { if (ev.target.value !== (e.adNotes || '')) onUpdateEntry({ ...e, adNotes: ev.target.value }) }}
                    style={{ width: '100%', minHeight: 32, maxHeight: 80, border: '1px solid #E8ECF4', borderRadius: 6, padding: '6px 8px', fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                  />
                </td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected.size > 0 && (
        <div className="cc-bulk-bar">
          <span>{selected.size} selected</span>
          {STATUSES.map(s => (
            <button key={s} className="btn-sec" onClick={() => { onBulkAction('status', [...selected], s); setSelected(new Set()) }}>→ {s}</button>
          ))}
          <button className="cc-btn cc-btn-danger" onClick={() => { onBulkAction('delete', [...selected]); setSelected(new Set()) }}>Delete</button>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ContentCalendarTab() {
  const [entries, setEntries] = useState([])
  const [view, setView] = useState('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [drawer, setDrawer] = useState(null)
  const [videoModal, setMediaModal] = useState(null)
  const fileInputRef = useRef()

  // Load entries from server on mount
  useEffect(() => { fetchEntries().then(setEntries) }, [])

  const openNew = (date) => setDrawer({ mode: 'new', date })
  const openEdit = (entry) => setDrawer({ mode: 'edit', entry })
  const closeDrawer = () => setDrawer(null)

  const handleSaveEntry = async (form) => {
    await saveEntry(form)
    const fresh = await fetchEntries()
    setEntries(fresh)
  }

  const deleteEntry = async (id) => {
    await deleteEntryAPI(id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const reschedule = async (id, newDate) => {
    const entry = entries.find(e => e.id === id)
    if (!entry) return
    const updated = { ...entry, date: newDate }
    await saveEntry(updated)
    setEntries(prev => prev.map(e => e.id === id ? updated : e))
  }

  const handleUpdateEntry = async (updated) => {
    await saveEntry(updated)
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
  }

  const bulkAction = async (type, ids, value) => {
    if (type === 'status') {
      await bulkStatusAPI(ids, value)
      setEntries(prev => prev.map(e => ids.includes(e.id) ? { ...e, status: value } : e))
    }
    if (type === 'delete') {
      await bulkDeleteAPI(ids)
      setEntries(prev => prev.filter(e => !ids.includes(e.id)))
    }
  }

  const exportJSON = () => {
    window.open(`${API}/export`, '_blank')
  }

  const importJSON = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)
        if (!Array.isArray(data)) return alert('Invalid JSON file')
        await fetch(`${API}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        setEntries(data)
      } catch { alert('Invalid JSON file') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const drawerEntry = drawer?.mode === 'edit'
    ? drawer.entry
    : drawer?.mode === 'new'
    ? { id: uid(), brand: BRANDS[0], platform: PLATFORMS[0], date: drawer.date || fmtDate(new Date()), time: '09:00', caption: '', hook: '', cta: '', status: 'Draft', notes: '', videoName: '', videoSize: 0, thumbnail: null, videoUrl: null }
    : null

  return (
    <div className="page cc-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Ads Testing</h2>
          <p className="page-sub">Manage and track ad creative performance</p>
        </div>
        <div className="page-actions">
          <input ref={fileInputRef} type="file" accept=".json" hidden onChange={importJSON} />
          <button className="btn-sec" onClick={() => fileInputRef.current?.click()}>Import</button>
          <button className="btn-sec" onClick={exportJSON}>Export</button>
          <button className="btn-primary" onClick={() => openNew(fmtDate(new Date()))}>+ New Entry</button>
        </div>
      </div>

      <ListView
        entries={entries}
        onClickEntry={openEdit}
        onBulkAction={bulkAction}
        onUpdateEntry={handleUpdateEntry}
      />

      {drawer && (
        <EntryDrawer
          entry={drawer.mode === 'edit' ? drawer.entry : drawerEntry}
          isNew={drawer.mode === 'new'}
          onSave={handleSaveEntry}
          onDelete={deleteEntry}
          onClose={closeDrawer}
        />
      )}

      <MediaModal url={videoModal} onClose={() => setMediaModal(null)} />
    </div>
  )
}
