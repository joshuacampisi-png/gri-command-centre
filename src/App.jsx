import { useEffect, useState, useCallback } from 'react'
import { fetchDashboard, fetchThemeAssets, fetchThemeAsset, saveThemeAsset } from './api'
import KeywordRankings from './components/KeywordRankings'
import CompetitorComparison from './components/CompetitorComparison'
import BlogApproval from './components/BlogApproval'
import GSCVisibility from './components/GSCVisibility'
import MarketShare from './components/MarketShare'
import TNTDashboard from './components/TNTDashboard'

const NAV = ['Overview', 'Tasks', 'Completed', 'Keywords', 'Competitors', 'Trends', 'TNT Hire', 'Themes', 'Theme Editor', 'Settings']

const COMPANIES = {
  GRI:     { name: 'Gender Reveal Ideas', description: 'Gender reveal party supplies',          accent: '#ef4444' },
  Lionzen: { name: 'Lionzen',             description: 'Mushroom tinctures & functional wellness', accent: '#f97316' },
  GBU:     { name: 'GBU',                 description: 'Gel blasters & tactical products',      accent: '#f43f5e' },
}

// ── Shared ────────────────────────────────────────────────────────────────────

function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div><h2 className="page-title">{title}</h2>{subtitle && <p className="page-sub">{subtitle}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

function Empty({ icon, title, body }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{body}</p></div>
}

// ── Overview ──────────────────────────────────────────────────────────────────

const ACTION_ICONS = { 'theme-push': '🎨', '404-redirect': '🔀', 'meta-description': '📝', 'alt-text': '🖼️' }
const ACTION_LABELS = { 'theme-push': 'Theme Update', '404-redirect': '404 Fixed', 'meta-description': 'Meta Description', 'alt-text': 'Alt Text' }

function ActivityFeed() {
  const [entries, setEntries] = useState([])
  useEffect(() => {
    fetch('/api/automation/activity')
      .then(r => r.json())
      .then(d => setEntries(d.entries || []))
      .catch(() => {})
  }, [])

  if (entries.length === 0) return (
    <div className="ov-card full">
      <h3>Live Activity Log</h3>
      <p className="muted">No live pushes yet — approve a task from the Tasks page to see results here.</p>
    </div>
  )

  return (
    <div className="ov-card full">
      <h3>Live Activity Log</h3>
      {entries.map(e => (
        <div key={e.id} className="activity-entry">
          <div className="activity-icon">{ACTION_ICONS[e.type] || '✅'}</div>
          <div className="activity-body">
            <div className="activity-title">
              <strong>{ACTION_LABELS[e.type] || e.type}</strong>
              <span className="activity-ts">{new Date(e.ts).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <div className="activity-what">{e.summary?.what}</div>
            {(e.summary?.oldValue || e.summary?.newValue) && (
              <div className="comp-meta-diff" style={{marginTop:6}}>
                {e.summary?.oldValue && (
                  <div className="comp-meta-block comp-meta-old">
                    <div className="comp-meta-label">❌ OLD ({e.summary.oldValue.length} chars)</div>
                    <div className="comp-meta-text">"{e.summary.oldValue}"</div>
                  </div>
                )}
                {e.summary?.newValue && (
                  <div className="comp-meta-block comp-meta-new">
                    <div className="comp-meta-label">✅ NEW ({e.summary.newValue.length} chars)</div>
                    <div className="comp-meta-text">"{e.summary.newValue}"</div>
                  </div>
                )}
              </div>
            )}
            {e.summary?.benefit && <div className="activity-benefit">📈 {e.summary.benefit}</div>}
            {e.type === 'alt-text' && e.summary?.changes?.length > 0 && (
              <div className="cs-alt-table" style={{marginTop:8}}>
                <div className="cs-alt-table-header">
                  <span>IMAGES UPDATED ({e.summary.changes.length})</span>
                </div>
                <div className="cs-alt-table-body">
                  {e.summary.changes.map((c, i) => (
                    <div key={i} className="cs-alt-row">
                      <span className="cs-alt-product">{c.product}</span>
                      <span className="cs-alt-text">"{c.altText}"</span>
                      <a href={`https://genderrevealideas.com.au/products/${c.productHandle}`} target="_blank" rel="noreferrer" className="cs-alt-verify">Verify →</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {e.liveUrl && (
              <a href={e.liveUrl} target="_blank" rel="noreferrer" className="activity-verify-btn">
                Verify Live →
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function OverviewPage({ data, company }) {
  const stats   = data?.stats        || []
  const tasks   = data?.tasks        || []
  const shopify = data?.shopify      || {}
  const integ   = data?.integrations || {}
  const byType  = tasks.reduce((a, t) => { a[t.taskType] = (a[t.taskType]||0)+1; return a }, {})
  const byStatus= tasks.reduce((a, t) => { a[t.status]   = (a[t.status]  ||0)+1; return a }, {})

  return (
    <div className="page">
      <PageHeader title="Overview" subtitle={`Command Centre — ${COMPANIES[company]?.name || company}`} />

      <div className="stats-row">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <span className="stat-label">{s.label}</span>
            <strong className="stat-value">{s.value}</strong>
          </div>
        ))}
      </div>

      <div className="ov-grid">
        <div className="ov-card">
          <h3>Integrations</h3>
          {Object.entries(integ).map(([k,v]) => (
            <div key={k} className="kv-row">
              <span>{k[0].toUpperCase()+k.slice(1)}</span>
              <span className={`pill ${v?'on':'off'}`}>{v?'Connected':'Offline'}</span>
            </div>
          ))}
        </div>

        <div className="ov-card">
          <h3>Tasks by Type</h3>
          {Object.keys(byType).length
            ? Object.entries(byType).map(([t,c]) => <div key={t} className="kv-row"><span>{t}</span><strong>{c}</strong></div>)
            : <p className="muted">No tasks yet</p>}
        </div>

        <div className="ov-card">
          <h3>Tasks by Status</h3>
          {Object.keys(byStatus).length
            ? Object.entries(byStatus).map(([s,c]) => <div key={s} className="kv-row"><span>{s}</span><strong>{c}</strong></div>)
            : <p className="muted">No tasks yet</p>}
        </div>

        <div className="ov-card">
          <h3>Shopify</h3>
          {shopify.connected
            ? <>
                <div className="kv-row"><span>Store</span><span className="muted">{shopify.shop?.name||'—'}</span></div>
                <div className="kv-row"><span>Themes</span><strong>{shopify.themes?.length||0}</strong></div>
                <div className="kv-row"><span>Plan</span><span className="muted">{shopify.shop?.plan_name||'—'}</span></div>
              </>
            : <p className="muted">Not connected</p>}
        </div>
      </div>

      <div className="ov-card full">
        <h3>Recent Tasks</h3>
        {tasks.length === 0
          ? <Empty icon="📋" title="No tasks" body="Tasks lodged via Telegram will appear here." />
          : tasks.slice(0,6).map(t => (
              <div key={t.id} className="mini-task">
                <div>
                  <span className="mini-task-title">{t.title}</span>
                  <span className="mini-task-meta">{t.taskType} · {t.executor} · {t.status}</span>
                </div>
                {t.notionUrl && <a href={t.notionUrl} target="_blank" rel="noreferrer" className="link-btn">Notion →</a>}
              </div>
            ))
        }
      </div>

      <ActivityFeed />
    </div>
  )
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

const STATUS_COLOR = { Backlog:'#6b7280','In Progress':'#3b82f6',Review:'#f59e0b',Done:'#22c55e',Blocked:'#ef4444',Live:'#10b981',Rejected:'#ef4444',Approval:'#a855f7' }
const PRI_COLOR    = { High:'#ef4444', Medium:'#f59e0b', Low:'#6b7280' }

const STORE_HANDLE = 'bdd19a-3'

function is404Task(title = '') {
  return /404|failed to load|HTTP 404/i.test(title)
}

function extractDeadPath(title = '') {
  const m = title.match(/\/[a-z0-9_\-\/]+/)
  return m ? m[0].trim() : null
}

function shopifyRedirectUrl(deadPath) {
  const slug = (deadPath || '').split('/').pop() || ''
  const targetMap = {
    'gender-reveal-confetti': '/collections/confetti',
    'gender-reveal-powder':   '/collections/gender-reveal-powder',
    'gender-reveal-cannons':  '/collections/gender-reveal-cannons',
    'balloon-kits':           '/collections/all',
  }
  const target = targetMap[slug] || '/collections/all'
  return `https://admin.shopify.com/store/${STORE_HANDLE}/online_store/url_redirects/new?path=${encodeURIComponent(deadPath)}&target=${encodeURIComponent(target)}`
}

function TaskCard({ task, proposal, onApprove, onReject }) {
  const [expanded, setExpanded]   = useState(false)
  const [actioning, setActioning] = useState(null)
  const [result, setResult]       = useState(null)

  const statusColor = STATUS_COLOR[task.status] || '#6b7280'
  const priColor    = PRI_COLOR[task.priority]  || '#6b7280'
  const isSEO       = task.taskType === 'SEO'
  const isApproval  = task.status === 'Approval' || task.executionStage === 'Approval'
  const hasProposal = isApproval && proposal
  const previewUrl  = task.previewUrl
  const deadPath    = is404Task(task.title) ? extractDeadPath(task.title) : null
  const redirectUrl = deadPath ? shopifyRedirectUrl(deadPath) : null

  const handleApprove = async () => {
    setActioning('approve')
    try {
      // Text proposals: use approve-to-live with approveProposal flag
      const endpoint = hasProposal
        ? '/api/automation/approve-to-live'
        : '/api/automation/auto-fix'
      const body = hasProposal
        ? { taskId: task.id, approveProposal: true }
        : { taskId: task.id, fileKey: task.fileKey, title: task.title, issueType: task.taskType }

      const res = await fetch(endpoint, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      })
      const d = await res.json()
      if (d.ok) {
        const summary = d.result?.summary || d.summary
        setResult({ ok: true, action: d.action || d.result?.action, summary })
        if (onApprove) onApprove(task.id)
      } else {
        setResult({ ok: false, error: d.error })
      }
    } catch(e) { setResult({ ok: false, msg: `❌ ${e.message}` }) }
    setActioning(null)
  }

  const handleReject = async () => {
    setActioning('reject')
    try {
      await fetch('/api/automation/reject-change', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ taskId: task.id, reason: 'Rejected via dashboard' })
      })
      setResult({ ok: true, msg: '🗄️ Task archived' })
      if (onReject) onReject(task.id)
    } catch(e) { setResult({ ok: false, msg: `❌ ${e.message}` }) }
    setActioning(null)
  }

  // Parse description sections
  const desc = task.executionLog || task.description || ''
  const sections = {}
  const sectionKeys = ['WHAT TO FIX','WHY THIS MATTERS','EXPECTED OUTCOME','ACCEPTANCE CRITERIA','SOURCE','PAGE','SEVERITY','PREVIEW']
  let current = null
  for (const line of desc.split('\n')) {
    const key = sectionKeys.find(k => line.trim().startsWith(k))
    if (key) { current = key; sections[key] = '' }
    else if (current) sections[current] += (sections[current] ? '\n' : '') + line.trim()
  }

  const isLiveNow = result?.ok && (result.action === 'theme-push' || result.action === 'theme-redirect' || result.action === 'redirect')

  return (
    <div className={`task-card ${isApproval && !isLiveNow ? 'needs-approval' : ''} ${isLiveNow ? 'is-live-now' : ''}`}>
      {/* Header */}
      <div className="task-card-header" onClick={() => setExpanded(e => !e)}>
        <div className="task-card-left">
          <div className="task-card-badges">
            <span className="tc-badge" style={{background: priColor+'22', color: priColor, border:`1px solid ${priColor}44`}}>{task.priority || 'Medium'}</span>
            <span className="tc-badge" style={{background: isLiveNow ? '#22c55e22' : statusColor+'22', color: isLiveNow ? '#22c55e' : statusColor, border:`1px solid ${isLiveNow ? '#22c55e44' : statusColor+'44'}`}}>{isLiveNow ? '✅ LIVE' : task.status}</span>
            {isSEO && <span className="tc-badge seo-badge">SEO</span>}
            {isApproval && !isLiveNow && <span className="tc-badge approval-badge">⚡ Needs Approval</span>}
          </div>
          <span className="task-card-title">{task.title?.replace(/^\[SEO\]\s*/,'').replace(/^[⚡🧱🎯🔥✅]\s*/,'') || 'Untitled'}</span>
          <span className="task-card-meta">{task.taskType} · {task.executor || 'Automated'} · {task.company || 'GRI'}</span>
        </div>
        <div className="task-card-right">
          <span className="expand-arrow">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="task-card-body">
          {sections['WHAT TO FIX'] && (
            <div className="brief-section">
              <div className="brief-label">WHAT TO FIX</div>
              <div className="brief-text">{sections['WHAT TO FIX']}</div>
            </div>
          )}
          {sections['WHY THIS MATTERS'] && (
            <div className="brief-section">
              <div className="brief-label">WHY THIS MATTERS</div>
              <div className="brief-text">{sections['WHY THIS MATTERS']}</div>
            </div>
          )}
          {sections['EXPECTED OUTCOME'] && (
            <div className="brief-section">
              <div className="brief-label">EXPECTED OUTCOME</div>
              <div className="brief-text">{sections['EXPECTED OUTCOME']}</div>
            </div>
          )}
          {sections['ACCEPTANCE CRITERIA'] && (
            <div className="brief-section">
              <div className="brief-label">ACCEPTANCE CRITERIA</div>
              <div className="brief-text">{sections['ACCEPTANCE CRITERIA']}</div>
            </div>
          )}

          {/* Text proposal — OLD/NEW diff shown BEFORE approval */}
          {hasProposal && !result && (
            <div className="proposal-diff">
              <div className="proposal-diff-header">
                ✏️ <strong>Review before approving</strong>
                <span className="proposal-diff-sub">Text change — will go live only after you approve</span>
              </div>
              <div className="proposal-diff-blocks">
                <div className="proposal-block proposal-old">
                  <div className="proposal-label">❌ CURRENT ({proposal.oldValue?.length || 0} chars)</div>
                  <div className="proposal-text">"{proposal.oldValue}"</div>
                </div>
                <div className="proposal-block proposal-new">
                  <div className="proposal-label">✅ PROPOSED ({proposal.newValue?.length || 0} chars)</div>
                  <div className="proposal-text">"{proposal.newValue}"</div>
                </div>
              </div>
            </div>
          )}

          {/* Change summary — shown after push */}
          {result && result.summary && (
            <div className={`change-summary ${result.ok ? 'success' : 'info'}`}>
              <div className="change-summary-header">
                <span className="change-summary-icon">{result.ok ? '✅' : 'ℹ️'}</span>
                <span className="change-summary-title">
                  {result.ok ? '🚀 Change pushed live' : 'Manual action required'}
                </span>
                <span className="change-summary-time">{result.summary.timestamp}</span>
              </div>
              <div className="change-summary-rows">
                <div className="change-summary-row">
                  <span className="cs-label">WHAT CHANGED</span>
                  <span className="cs-value">{result.summary.what}</span>
                </div>
                <div className="change-summary-row">
                  <span className="cs-label">HOW IT WAS DONE</span>
                  <span className="cs-value">{result.summary.how}</span>
                </div>
                <div className="change-summary-row">
                  <span className="cs-label">BENEFIT TO STORE</span>
                  <span className="cs-value cs-benefit">{result.summary.benefit}</span>
                </div>
              </div>
              {/* Alt text QA table */}
              {result.ok && result.summary.changes && result.summary.changes.length > 0 && (
                <div className="cs-alt-table">
                  <div className="cs-alt-table-header">
                    <span>IMAGES UPDATED — QA REVIEW ({result.summary.changes.length} total)</span>
                  </div>
                  <div className="cs-alt-table-body">
                    {result.summary.changes.map((c, i) => (
                      <div key={i} className="cs-alt-row">
                        <span className="cs-alt-product">{c.product}</span>
                        <span className="cs-alt-text">"{c.altText}"</span>
                        <a
                          href={`https://genderrevealideas.com.au/products/${c.productHandle}`}
                          target="_blank" rel="noreferrer"
                          className="cs-alt-verify"
                        >Verify →</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.ok && result.summary.liveUrl && (
                <a href={result.summary.liveUrl} target="_blank" rel="noreferrer" className="cs-live-link cs-live-link-big">
                  🔗 View updated page live →
                </a>
              )}
            </div>
          )}

          {/* Error state */}
          {result && !result.summary && !result.ok && (
            <div className="change-summary info">
              <span style={{display:'flex',gap:8,alignItems:'center'}}>
                <span>❌</span>
                <span className="cs-value">{result.error || 'Something went wrong'}</span>
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="task-card-actions">
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noreferrer" className="btn-outline">
                  👁 Preview Changes
                </a>
              )}
              {task.notionUrl && (
                <a href={task.notionUrl} target="_blank" rel="noreferrer" className="btn-outline">
                  📋 View in Notion
                </a>
              )}
              {!result && task.status !== 'Live' && task.status !== 'Done' && task.status !== 'Rejected' && (
                <>
                  <button className="btn-approve" onClick={handleApprove} disabled={!!actioning}>
                    {actioning==='approve'
                      ? 'Working…'
                      : deadPath
                        ? '🚀 Fix 404 → Push Live'
                        : isApproval ? '✅ Approve → Push Live' : '🚀 Push to Live'}
                  </button>
                  <button className="btn-reject" onClick={handleReject} disabled={!!actioning}>
                    {actioning==='reject' ? 'Archiving…' : '✕ Reject'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TasksPage({ data }) {
  const all = data?.tasks || []
  const [view,      setView]      = useState('board')
  const [filter,    setFilter]    = useState('All')
  const [search,    setSearch]    = useState('')
  const [running,   setRunning]   = useState(false)
  const [flywheelMsg, setFlywheelMsg] = useState(null)
  const [localTasks, setLocalTasks]   = useState(all)
  const [proposals, setProposals] = useState({}) // taskId → proposal

  // Sync when data loads
  useState(() => { setLocalTasks(all) }, [all])

  // Poll pending text proposals every 15s
  useEffect(() => {
    const loadProposals = async () => {
      try {
        const r = await fetch('/api/automation/pending-proposals')
        const d = await r.json()
        if (d.ok) {
          const map = {}
          for (const p of d.proposals) map[p.taskId] = p
          setProposals(map)
        }
      } catch {}
    }
    loadProposals()
    const t = setInterval(loadProposals, 15000)
    return () => clearInterval(t)
  }, [])

  const STATUS_FILTERS = ['All','Backlog','In Progress','Approval','Live','Done','Blocked','Rejected']
  const needsApproval = localTasks.filter(t => t.status === 'Approval' || t.executionStage === 'Approval')
  const seoTasks      = localTasks.filter(t => t.taskType === 'SEO')

  const DONE_STATUSES = ['Live', 'Done', 'Completed', 'Rejected']
  const visible = localTasks
    .filter(t => filter==='All' ? !DONE_STATUSES.includes(t.status) : t.status===filter)
    .filter(t => !search || t.title?.toLowerCase().includes(search.toLowerCase()))

  const runFlywheel = async () => {
    setRunning(true)
    setFlywheelMsg(null)
    try {
      const r = await fetch('/api/automation/run-flywheel', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ company: 'GRI' })
      })
      const d = await r.json()
      setFlywheelMsg(d.ok
        ? `✅ Flywheel complete — ${d.tasksLodged} tasks lodged from ${d.pagesAudited} pages`
        : `❌ ${d.error}`)
    } catch(e) { setFlywheelMsg(`❌ ${e.message}`) }
    setRunning(false)
  }

  const handleApprove = id => setLocalTasks(t => t.map(x => x.id===id ? {...x, status:'Live'} : x))
  const handleReject  = id => setLocalTasks(t => t.map(x => x.id===id ? {...x, status:'Rejected'} : x))

  return (
    <div className="page">
      <PageHeader
        title="Tasks"
        subtitle={`${localTasks.length} total · ${needsApproval.length} need approval · ${seoTasks.length} SEO`}
        actions={
          <div style={{display:'flex',gap:8}}>
            <button className={`btn-outline ${view==='board'?'active':''}`} onClick={()=>setView('board')}>Cards</button>
            <button className={`btn-outline ${view==='table'?'active':''}`} onClick={()=>setView('table')}>Table</button>
            <button className="btn-primary" onClick={runFlywheel} disabled={running}>
              {running ? '⏳ Running SEO audit…' : '🔍 Run SEO Flywheel'}
            </button>
          </div>
        }
      />

      {flywheelMsg && (
        <div className={`flywheel-banner ${flywheelMsg.startsWith('✅')?'ok':'err'}`}>{flywheelMsg}</div>
      )}

      {/* Approval alert bar */}
      {needsApproval.length > 0 && (
        <div className="approval-alert">
          ⚡ <strong>{needsApproval.length} task{needsApproval.length>1?'s':''} need your approval</strong> — review below and push to live
        </div>
      )}

      {/* Filters */}
      <div className="toolbar">
        <input className="search-input" placeholder="Search tasks…" value={search} onChange={e=>setSearch(e.target.value)} />
        <div className="filter-tabs">
          {STATUS_FILTERS.map(s => (
            <button key={s} className={`ftab ${filter===s?'active':''}`} onClick={()=>setFilter(s)}>
              {s}{s==='Approval'&&needsApproval.length>0 ? ` (${needsApproval.length})`:''}{s==='All'?` (${localTasks.length})`:''}
            </button>
          ))}
        </div>
      </div>

      {/* Card view */}
      {view === 'board' && (
        visible.length === 0
          ? <Empty icon="✅" title="No tasks match" body="Try a different filter or run the SEO flywheel." />
          : <div className="task-cards">
              {visible.map(t => (
                <TaskCard key={t.id} task={t} proposal={proposals[t.id]} onApprove={handleApprove} onReject={handleReject} />
              ))}
            </div>
      )}

      {/* Table view */}
      {view === 'table' && (
        visible.length === 0
          ? <Empty icon="✅" title="No tasks match" body="Try a different filter." />
          : <div className="task-table">
              <div className="task-head"><span>Title</span><span>Type</span><span>Priority</span><span>Status</span><span>Executor</span><span></span></div>
              {visible.map(t => (
                <div key={t.id} className="task-row">
                  <span className="task-title">{t.title?.replace(/^\[SEO\]\s*/,'').replace(/^[⚡🧱🎯🔥✅]\s*/,'')}</span>
                  <span className="badge">{t.taskType}</span>
                  <span className="badge" style={{color:PRI_COLOR[t.priority]}}>{t.priority||'—'}</span>
                  <span className="badge" style={{color:STATUS_COLOR[t.status]}}>{t.status}</span>
                  <span className="badge">{t.executor||'—'}</span>
                  <div style={{display:'flex',gap:4}}>
                    {t.previewUrl && <a href={t.previewUrl} target="_blank" rel="noreferrer" className="link-btn">Preview</a>}
                    {t.notionUrl  && <a href={t.notionUrl}  target="_blank" rel="noreferrer" className="link-btn">Notion</a>}
                  </div>
                </div>
              ))}
            </div>
      )}
    </div>
  )
}

// ── Themes ────────────────────────────────────────────────────────────────────

function ThemesPage({ data, onOpenEditor }) {
  const shopify    = data?.shopify    || {}
  const policy     = data?.automation?.shopifyPolicy || {}
  const themes     = shopify.themes   || []
  const [sel, setSel]       = useState(null)
  const [compare, setCompare] = useState(false)

  const live    = themes.find(t => String(t.id)===String(policy.liveThemeId))
  const preview = themes.find(t => String(t.id)===String(policy.previewThemeId))
  const openPrev = id => window.open(`https://${policy.storeDomain}?preview_theme_id=${id}`,'_blank')
  const openEdit = id => window.open(`https://${policy.storeDomain}/admin/themes/${id}/editor`,'_blank')

  if (!shopify.connected) return (
    <div className="page">
      <PageHeader title="Themes" subtitle="Shopify theme management" />
      <Empty icon="🎨" title="Shopify not connected" body="Connect your store in Settings." />
    </div>
  )

  return (
    <div className="page themes-page">
      <PageHeader title="Themes" subtitle={`${themes.length} themes · ${policy.storeDomain||''}`}
        actions={
          <label className="toggle-label">
            <input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)} /> Compare Live vs Preview
          </label>
        }
      />

      <div className="themes-layout">
        <div className="themes-sidebar">
          {live && (
            <div className="theme-card live-card">
              <span className="badge badge-live">LIVE</span>
              <h4>{live.name}</h4><p className="muted">ID: {live.id}</p>
              <div className="card-btns">
                <button onClick={()=>openPrev(live.id)}>👁 Preview</button>
                <button onClick={()=>openEdit(live.id)}>✏️ Edit</button>
                <button className="btn-sec" onClick={()=>onOpenEditor(live)}>Theme Editor</button>
              </div>
            </div>
          )}
          {preview && (
            <div className="theme-card prev-card">
              <span className="badge badge-prev">PREVIEW</span>
              <h4>{preview.name}</h4><p className="muted">ID: {preview.id}</p>
              <div className="card-btns">
                <button onClick={()=>openPrev(preview.id)}>👁 Preview</button>
                <button onClick={()=>openEdit(preview.id)}>✏️ Edit</button>
                <button className="btn-pub" onClick={()=>alert('Publish flow')}>🚀 Publish</button>
              </div>
            </div>
          )}
          <div className="theme-list-wrap">
            <h4>All Themes ({themes.length})</h4>
            {themes.map(t => {
              const isL = String(t.id)===String(policy.liveThemeId)
              const isP = String(t.id)===String(policy.previewThemeId)
              return (
                <div key={t.id} className={`theme-row ${sel?.id===t.id?'selected':''}`} onClick={()=>setSel(t)}>
                  <div>
                    <strong>{t.name}</strong>
                    {isL && <span className="mini-badge live">LIVE</span>}
                    {isP && <span className="mini-badge prev">PREV</span>}
                    <p className="muted" style={{margin:'2px 0 0',fontSize:12}}>ID: {t.id} · {t.role}</p>
                  </div>
                  <div className="row-btns">
                    <button onClick={e=>{e.stopPropagation();openPrev(t.id)}}>👁️</button>
                    <button onClick={e=>{e.stopPropagation();openEdit(t.id)}}>✏️</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="themes-main">
          {compare ? (
            <div className="compare-view">
              {[{label:'Live',t:live},{label:'Preview',t:preview}].map(({label,t})=>(
                <div key={label} className="compare-panel">
                  <div className="compare-head">
                    <h3>{label} — {t?.name}</h3>
                    <button onClick={()=>openEdit(t?.id)}>Edit in Shopify</button>
                  </div>
                  <div className="frame-wrap"><iframe src={`https://${policy.storeDomain}?preview_theme_id=${t?.id}`} title={label} /></div>
                </div>
              ))}
            </div>
          ) : sel ? (
            <div className="theme-detail">
              <div className="detail-head">
                <div><h2>{sel.name}</h2><p className="muted">ID: {sel.id} · {sel.role}</p></div>
                <div className="card-btns">
                  <button onClick={()=>openPrev(sel.id)}>Preview</button>
                  <button onClick={()=>openEdit(sel.id)}>Edit in Shopify</button>
                  <button className="btn-sec" onClick={()=>onOpenEditor(sel)}>Open Theme Editor</button>
                  {sel.role!=='main' && <button className="btn-pub" onClick={()=>alert('Publish')}>Publish</button>}
                </div>
              </div>
              <div className="frame-wrap full"><iframe src={`https://${policy.storeDomain}?preview_theme_id=${sel.id}`} title={sel.name} /></div>
            </div>
          ) : (
            <Empty icon="🎨" title="Select a theme" body="Pick a theme from the list to preview it, or enable Compare mode." />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Theme Editor ──────────────────────────────────────────────────────────────

const FILE_FOLDERS = ['layout','templates','sections','snippets','assets','config','locales']

function ThemeEditorPage({ data, initialTheme }) {
  const shopify  = data?.shopify    || {}
  const policy   = data?.automation?.shopifyPolicy || {}
  const themes   = shopify.themes   || []

  const [theme, setTheme]       = useState(initialTheme || themes.find(t=>String(t.id)===String(policy.liveThemeId)) || themes[0] || null)
  const [assets, setAssets]     = useState([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [openFolders, setOpenFolders]     = useState({ layout:true, templates:true, sections:false, snippets:false, assets:false, config:false, locales:false })
  const [activeFile, setActiveFile]       = useState(null)
  const [code, setCode]         = useState('')
  const [origCode, setOrigCode] = useState('')
  const [fileLoading, setFileLoading]     = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState(null)
  const [search, setSearch]     = useState('')

  const loadAssets = useCallback(async (t) => {
    if (!t) return
    setAssetsLoading(true)
    setActiveFile(null)
    setCode('')
    setOrigCode('')
    try {
      const res = await fetchThemeAssets(t.id)
      setAssets(res.assets || [])
    } catch(e) { setAssets([]) }
    setAssetsLoading(false)
  }, [])

  useEffect(() => { if (theme) loadAssets(theme) }, [theme, loadAssets])

  const openFile = async (asset) => {
    const editable = ['application/javascript','text/css','text/html','application/json','text/plain'].includes(asset.content_type) || asset.key.match(/\.(liquid|js|css|json|txt|md|svg)$/)
    if (!editable) { setSaveMsg({ ok:false, text:`Cannot edit binary file: ${asset.key}` }); return }
    setFileLoading(true)
    setActiveFile(asset)
    setCode('')
    setSaveMsg(null)
    try {
      const res = await fetchThemeAsset(theme.id, asset.key)
      const content = res.code || res.asset?.value || ''
      setCode(content)
      setOrigCode(content)
    } catch(e) { setCode('// Error loading file') }
    setFileLoading(false)
  }

  const handleSave = async () => {
    if (!theme || !activeFile) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await saveThemeAsset(theme.id, activeFile.key, code)
      setOrigCode(code)
      setSaveMsg({ ok:true, text:'Saved to Shopify ✓' })
    } catch(e) { setSaveMsg({ ok:false, text:`Save failed: ${e.message}` }) }
    setSaving(false)
    setTimeout(()=>setSaveMsg(null), 4000)
  }

  const grouped = FILE_FOLDERS.reduce((acc, folder) => {
    acc[folder] = assets.filter(a => {
      const matchesFolder = a.key.startsWith(folder+'/')
      const matchesSearch = !search || a.key.toLowerCase().includes(search.toLowerCase())
      return matchesFolder && matchesSearch
    })
    return acc
  }, {})

  const isDirty = code !== origCode
  const shopifyUrl = theme && policy.storeDomain ? `https://${policy.storeDomain}/admin/themes/${theme.id}/editor` : null

  if (!shopify.connected) return (
    <div className="page">
      <PageHeader title="Theme Editor" subtitle="Edit theme files directly from the dashboard" />
      <Empty icon="🛠️" title="Shopify not connected" body="Connect your store in Settings." />
    </div>
  )

  return (
    <div className="page editor-page">
      <PageHeader title="Theme Editor" subtitle={theme ? `${theme.name}${String(theme.id)===String(policy.liveThemeId)?' — LIVE':''}` : 'Select a theme'}
        actions={
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <select className="select" value={theme?.id||''} onChange={e=>{ const t=themes.find(t=>String(t.id)===e.target.value); setTheme(t) }}>
              <option value="">Select theme…</option>
              {themes.map(t=><option key={t.id} value={String(t.id)}>{t.name}{String(t.id)===String(policy.liveThemeId)?' (Live)':t.role==='unpublished'?' (Preview)':''}</option>)}
            </select>
            {shopifyUrl && <a href={shopifyUrl} target="_blank" rel="noreferrer" className="btn-outline">Open in Shopify ↗</a>}
          </div>
        }
      />

      {!theme ? (
        <Empty icon="🎨" title="No theme selected" body="Choose a theme from the dropdown above to start editing." />
      ) : (
        <div className="file-editor-layout">

          {/* ── File Browser ── */}
          <div className="file-browser">
            <div className="file-browser-header">
              <span>Files</span>
              <span className="muted" style={{fontSize:11}}>{assets.length} total</span>
            </div>
            <input
              className="file-search"
              placeholder="Search files…"
              value={search}
              onChange={e=>setSearch(e.target.value)}
            />
            {assetsLoading ? (
              <div className="file-loading">Loading files…</div>
            ) : (
              FILE_FOLDERS.map(folder => {
                const files = grouped[folder]
                if (files.length === 0 && search) return null
                return (
                  <div key={folder} className="file-folder">
                    <div className="file-folder-header" onClick={()=>setOpenFolders(p=>({...p,[folder]:!p[folder]}))}>
                      <span className="folder-arrow">{openFolders[folder]?'▾':'▸'}</span>
                      <span className="folder-name">{folder}</span>
                      <span className="folder-count">{files.length}</span>
                    </div>
                    {openFolders[folder] && (
                      <div className="file-list">
                        {files.map(a => {
                          const name = a.key.replace(folder+'/', '')
                          const isActive = activeFile?.key === a.key
                          return (
                            <div
                              key={a.key}
                              className={`file-item ${isActive?'active':''}`}
                              onClick={()=>openFile(a)}
                              title={a.key}
                            >
                              {name}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* ── Code Editor ── */}
          <div className="code-editor-panel">
            {!activeFile ? (
              <div className="code-placeholder">
                <div className="code-placeholder-icon">📄</div>
                <p>Select a file from the browser to edit it</p>
                <p className="muted">Changes are saved directly to Shopify</p>
              </div>
            ) : (
              <>
                <div className="code-editor-toolbar">
                  <div className="code-editor-filename">
                    <span className="filename-path">{activeFile.key}</span>
                    {isDirty && <span className="unsaved-dot" title="Unsaved changes">●</span>}
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {saveMsg && <span className={`save-msg ${saveMsg.ok?'ok':'err'}`}>{saveMsg.text}</span>}
                    <button className="btn-outline" onClick={()=>{setCode(origCode);setSaveMsg(null)}} disabled={!isDirty}>Reset</button>
                    <button className="btn-primary" onClick={handleSave} disabled={saving||!isDirty}>
                      {saving ? 'Saving…' : 'Save to Shopify'}
                    </button>
                  </div>
                </div>
                {fileLoading ? (
                  <div className="code-loading">Loading file…</div>
                ) : (
                  <textarea
                    className="code-textarea"
                    value={code}
                    onChange={e=>setCode(e.target.value)}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                )}
              </>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Completed Tasks ───────────────────────────────────────────────────────────

const COMPLETED_TYPE_ICONS  = { 'theme-push': '🎨', '404-redirect': '🔀', 'meta-description': '📝', 'alt-text': '🖼️', SEO: '🔍', default: '✅' }
const COMPLETED_TYPE_LABELS = { 'theme-push': 'Theme Update', '404-redirect': '404 Fixed', 'meta-description': 'Meta Description', 'alt-text': 'Alt Text', SEO: 'SEO', default: 'Task' }

function CompletedCard({ item, isExpanded, onToggle }) {
  const icon  = COMPLETED_TYPE_ICONS[item.type]  || COMPLETED_TYPE_ICONS.default
  const label = COMPLETED_TYPE_LABELS[item.type] || item.type || 'Task'
  const ts    = item.ts ? new Date(item.ts).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'medium', timeStyle: 'short' }) : item.summary?.timestamp || '—'

  return (
    <div className={`completed-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="completed-card-header" onClick={onToggle}>
        <div className="completed-card-left">
          <span className="completed-type-icon">{icon}</span>
          <div className="completed-card-info">
            <span className="completed-card-title">{item.title || item.summary?.what || 'Completed task'}</span>
            <span className="completed-card-meta">
              <span className="completed-type-badge">{label}</span>
              <span className="completed-ts">{ts}</span>
            </span>
          </div>
        </div>
        <div className="completed-card-right">
          <span className="completed-live-badge">Live ✅</span>
          <span className="completed-expand">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="completed-card-body">
          {item.summary?.what && (
            <div className="comp-section">
              <div className="comp-section-label">WHAT CHANGED</div>
              <div className="comp-section-value">{item.summary.what}</div>
            </div>
          )}
          {item.summary?.how && (
            <div className="comp-section">
              <div className="comp-section-label">HOW IT WAS DONE</div>
              <div className="comp-section-value">{item.summary.how}</div>
            </div>
          )}
          {item.summary?.benefit && (
            <div className="comp-section">
              <div className="comp-section-label">BENEFIT</div>
              <div className="comp-section-value comp-benefit">{item.summary.benefit}</div>
            </div>
          )}
          {(item.summary?.oldValue || item.summary?.newValue) && (
            <div className="comp-meta-diff">
              {item.summary?.oldValue && (
                <div className="comp-meta-block comp-meta-old">
                  <div className="comp-meta-label">❌ OLD ({item.summary.oldValue.length} chars)</div>
                  <div className="comp-meta-text">"{item.summary.oldValue}"</div>
                </div>
              )}
              {item.summary?.newValue && (
                <div className="comp-meta-block comp-meta-new">
                  <div className="comp-meta-label">✅ NEW ({item.summary.newValue.length} chars)</div>
                  <div className="comp-meta-text">"{item.summary.newValue}"</div>
                </div>
              )}
            </div>
          )}
          {item.type === 'alt-text' && item.summary?.changes?.length > 0 && (
            <div className="cs-alt-table" style={{marginTop:10}}>
              <div className="cs-alt-table-header">IMAGES UPDATED ({item.summary.changes.length})</div>
              <div className="cs-alt-table-body">
                {item.summary.changes.map((c, i) => (
                  <div key={i} className="cs-alt-row">
                    <span className="cs-alt-product">{c.product}</span>
                    <span className="cs-alt-text">"{c.altText}"</span>
                    <a href={`https://genderrevealideas.com.au/products/${c.productHandle}`} target="_blank" rel="noreferrer" className="cs-alt-verify">Verify →</a>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="completed-card-footer">
            {(item.liveUrl || item.summary?.liveUrl) && (
              <a href={item.liveUrl || item.summary?.liveUrl} target="_blank" rel="noreferrer" className="comp-verify-btn">
                🔗 View Live →
              </a>
            )}
            {item.notionUrl && (
              <a href={item.notionUrl} target="_blank" rel="noreferrer" className="comp-notion-btn">
                📋 Notion →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CompletedPage({ data }) {
  const [entries, setEntries]     = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading]     = useState(true)

  // Notion tasks that are Live/Done/Completed (but not in activity log)
  const notionDone = (data?.tasks || []).filter(t => ['Live', 'Done', 'Completed'].includes(t.status))

  useEffect(() => {
    fetch('/api/automation/activity')
      .then(r => r.json())
      .then(d => { setEntries(d.entries || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Merge: activity log is primary (has full summary). Notion tasks not in log shown below.
  const activityTitles = new Set(entries.map(e => e.title))
  const notionOnly = notionDone.filter(t => !activityTitles.has(t.title))

  // Build merged list for rendering — activity log + notion-only extras
  const allItems = [
    ...entries.map(e => ({ ...e, _source: 'activity' })),
    ...notionOnly.map(t => ({ id: t.id, ts: t.lastUpdated ? new Date(t.lastUpdated).getTime() : 0, title: t.title, type: t.taskType, notionUrl: t.notionUrl, summary: null, _source: 'notion' }))
  ]

  // Group by date descending
  const grouped = allItems.reduce((acc, item) => {
    const date = item.ts
      ? new Date(item.ts).toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'long' })
      : 'Unknown date'
    if (!acc[date]) acc[date] = []
    acc[date].push(item)
    return acc
  }, {})

  const sortedDates = Object.keys(grouped).sort((a, b) => {
    const ta = grouped[a][0]?.ts || 0
    const tb = grouped[b][0]?.ts || 0
    return tb - ta
  })

  if (loading) return (
    <div className="page">
      <PageHeader title="Completed" subtitle="All QA'd and live tasks" />
      <div className="loading"><div className="spinner"/>Loading…</div>
    </div>
  )

  if (allItems.length === 0) return (
    <div className="page">
      <PageHeader title="Completed" subtitle="All QA'd and live tasks" />
      <Empty icon="✅" title="Nothing here yet" body="Approved tasks will appear here once they're live and QA'd." />
    </div>
  )

  return (
    <div className="page completed-page">
      <PageHeader
        title="Completed"
        subtitle={`${allItems.length} task${allItems.length !== 1 ? 's' : ''} completed and live`}
      />

      {sortedDates.map(date => (
        <div key={date} className="completed-group">
          <div className="completed-group-header">
            <span className="completed-group-date">{date}</span>
            <span className="completed-group-count">{grouped[date].length} completed</span>
          </div>
          <div className="completed-group-cards">
            {grouped[date].map(item => (
              <CompletedCard
                key={item.id}
                item={item}
                isExpanded={expandedId === item.id}
                onToggle={() => setExpandedId(id => id === item.id ? null : item.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Keywords ──────────────────────────────────────────────────────────────────

// ── Settings ──────────────────────────────────────────────────────────────────

function SettingsPage({ data, company, onCompanyChange }) {
  const integ   = data?.integrations || {}
  const shopify = data?.shopify      || {}
  const policy  = data?.automation?.shopifyPolicy || {}

  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Command Centre configuration" />

      <div className="settings-grid">
        <div className="settings-card">
          <h3>Active Brand</h3>
          <p className="muted">Switch brands to load their Shopify + Notion data.</p>
          <div className="company-btn-group">
            {Object.keys(COMPANIES).map(c => (
              <button key={c} className={`company-btn ${company===c?'active':''}`} onClick={()=>onCompanyChange(c)}>{c}</button>
            ))}
          </div>
        </div>

        <div className="settings-card">
          <h3>Integration Status</h3>
          <p className="muted">Live status of all connected services.</p>
          {Object.entries(integ).map(([k,v]) => (
            <div key={k} className="kv-row">
              <span>{k[0].toUpperCase()+k.slice(1)}</span>
              <span className={`pill ${v?'on':'off'}`}>{v?'Connected':'Offline'}</span>
            </div>
          ))}
        </div>

        <div className="settings-card">
          <h3>Shopify Store</h3>
          {shopify.connected ? (
            <>
              <div className="kv-row"><span>Store</span><span className="muted">{shopify.shop?.name}</span></div>
              <div className="kv-row"><span>Domain</span><span className="muted">{policy.storeDomain}</span></div>
              <div className="kv-row"><span>Plan</span><span className="muted">{shopify.shop?.plan_name}</span></div>
              <div className="kv-row"><span>Themes</span><strong>{shopify.themes?.length}</strong></div>
              <div className="kv-row"><span>Live Theme ID</span><span className="muted">{policy.liveThemeId}</span></div>
              <div className="kv-row"><span>Preview Theme ID</span><span className="muted">{policy.previewThemeId}</span></div>
            </>
          ) : <p className="muted">Not connected. Set SHOPIFY_ACCESS_TOKEN in .env</p>}
        </div>

        <div className="settings-card">
          <h3>Environment Variables</h3>
          <p className="muted">Required keys in your .env file.</p>
          {['SHOPIFY_ACCESS_TOKEN','SHOPIFY_STORE_URL','NOTION_TOKEN','NOTION_TASKS_DB','SLACK_BOT_TOKEN','ANTHROPIC_API_KEY','TELEGRAM_BOT_TOKEN'].map(k => (
            <div key={k} className="kv-row">
              <code style={{fontSize:12}}>{k}</code>
              <span className="pill neutral">Check .env</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Keyword Tracker ───────────────────────────────────────────────────────────

const KW_SEVERITY_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308' }
const KW_STATUS_COLOR   = { CRITICAL: '#ef4444', VOLATILE: '#f97316', IMPROVING: '#10b981', STABLE: '#6b7280' }
const KW_STATUS_LABEL   = { CRITICAL: '🔴 Critical', VOLATILE: '🟠 Volatile', IMPROVING: '🟢 Improving', STABLE: '⚪ Stable' }

function Sparkline({ history, width = 80, height = 28 }) {
  if (!history || history.length < 2) return <span className="kw-no-history">—</span>

  const ranks = history.map(h => h.rank).filter(r => r !== null)
  if (ranks.length < 2) return <span className="kw-no-history">—</span>

  // Invert: lower rank number = better = higher on chart
  const min = Math.min(...ranks)
  const max = Math.max(...ranks)
  const range = max - min || 1

  const pts = ranks.map((r, i) => {
    const x = (i / (ranks.length - 1)) * width
    const y = ((r - min) / range) * (height - 4) + 2  // invert: better rank = lower y
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Color: last rank better than first = green, worse = red
  const trend = ranks[ranks.length - 1] < ranks[0] ? '#10b981' : ranks[ranks.length - 1] > ranks[0] ? '#ef4444' : '#6b7280'

  return (
    <svg width={width} height={height} className="kw-sparkline">
      <polyline points={pts} fill="none" stroke={trend} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ChangeChip({ change }) {
  if (change === null || change === 0) return <span className="kw-change neutral">—</span>
  const up = change > 0
  return (
    <span className={`kw-change ${up ? 'up' : 'down'}`}>
      {up ? '▲' : '▼'} {Math.abs(change)}
    </span>
  )
}

function RankBadge({ rank }) {
  if (rank === null || rank === undefined) return <span className="kw-rank unranked">—</span>
  const cls = rank <= 3 ? 'top3' : rank <= 10 ? 'top10' : rank <= 20 ? 'top20' : ''
  return <span className={`kw-rank ${cls}`}>#{rank}</span>
}

function AlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null
  const critical = alerts.filter(a => a.severity === 'critical')
  const high = alerts.filter(a => a.severity === 'high')

  return (
    <div className="kw-alert-banner">
      {critical.length > 0 && (
        <div className="kw-alert critical">
          <span className="kw-alert-icon">🚨</span>
          <div className="kw-alert-body">
            <strong>{critical.length} Critical Drop{critical.length > 1 ? 's' : ''}</strong>
            {critical.slice(0, 2).map((a, i) => (
              <div key={i} className="kw-alert-line">{a.message}</div>
            ))}
          </div>
        </div>
      )}
      {high.length > 0 && (
        <div className="kw-alert high">
          <span className="kw-alert-icon">⚠️</span>
          <div className="kw-alert-body">
            <strong>{high.length} High Severity Alert{high.length > 1 ? 's' : ''}</strong>
            {high.slice(0, 2).map((a, i) => (
              <div key={i} className="kw-alert-line">{a.message}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function KeywordTrackerPage() {
  const [state, setState]           = useState({ status: 'loading' })
  const [filter, setFilter]         = useState('all')   // all | improving | declining | critical
  const [sort, setSort]             = useState('rank')
  const [search, setSearch]         = useState('')
  const [refreshing, setRefreshing]   = useState(false)
  const [refreshMsg, setRefreshMsg]   = useState(null)
  const [blogTasks, setBlogTasks]     = useState([])
  const [blogExpanded, setBlogExpanded] = useState(null)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ sort })
      const [rankRes, blogRes] = await Promise.all([
        fetch(`/api/keywords/rankings?${params}`),
        fetch(`/api/keywords/blog-tasks`),
      ])
      const data = await rankRes.json()
      const blogData = await blogRes.json()
      setState(data)
      setBlogTasks(blogData.tasks || [])
    } catch (e) {
      setState({ status: 'error', error: e.message, keywords: [], alerts: [] })
    }
  }, [sort])

  useEffect(() => { load() }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const res = await fetch('/api/keywords/refresh', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setRefreshMsg({ ok: true, text: `✅ Refreshed ${data.stats?.total || 0} keywords` })
        await load()
      } else {
        setRefreshMsg({ ok: false, text: `❌ ${data.error}` })
      }
    } catch (e) {
      setRefreshMsg({ ok: false, text: `❌ ${e.message}` })
    } finally {
      setRefreshing(false)
    }
  }

  // Filter + search client-side
  const keywords = (state.keywords || []).filter(kw => {
    if (search && !kw.keyword.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'improving') return kw.change > 0
    if (filter === 'declining') return kw.change < 0
    if (filter === 'critical')  return kw.status === 'CRITICAL' || kw.change <= -6
    if (filter === 'top10')     return kw.rank !== null && kw.rank <= 10
    return true
  })

  const stats = state.stats
  const updatedAt = state.updatedAt
    ? new Date(state.updatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'short', timeStyle: 'short' })
    : null

  if (state.status === 'loading') return (
    <div className="page">
      <PageHeader title="Keyword Tracker" subtitle="Keyword.com API — GRI Rankings" />
      <div className="loading"><div className="spinner" />Loading rankings…</div>
    </div>
  )

  if (state.status === 'no-credentials') return (
    <div className="page">
      <PageHeader title="Keyword Tracker" subtitle="Keyword.com API — GRI Rankings" />
      <div className="kw-setup-card">
        <div className="kw-setup-icon">🔑</div>
        <h3>API Key Required</h3>
        <p>Add your Keyword.com API key to the <code>.env</code> file:</p>
        <code className="kw-setup-code">KEYWORD_COM_API_KEY=your_api_key_here</code>
        <p className="muted">Project ID <code>IfZYQs3</code> is pre-configured.</p>
      </div>
    </div>
  )

  if (state.status === 'fetching') return (
    <div className="page">
      <PageHeader title="Keyword Tracker" subtitle="Keyword.com API — GRI Rankings" />
      <div className="kw-setup-card">
        <div className="kw-setup-icon">⏳</div>
        <h3>First-time fetch in progress</h3>
        <p className="muted">Fetching all keyword rankings from Keyword.com. Refresh in ~30 seconds.</p>
      </div>
    </div>
  )

  return (
    <div className="page kw-page">
      <PageHeader
        title="Keyword Tracker"
        subtitle={updatedAt ? `Last updated: ${updatedAt} AEST` : 'Keyword.com API — GRI Rankings'}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {refreshMsg && <span className={`save-msg ${refreshMsg.ok ? 'ok' : 'err'}`}>{refreshMsg.text}</span>}
            <button className="btn-outline" onClick={async () => {
              setRefreshMsg({ ok: true, text: '🔍 Scanning for drops…' })
              try {
                const r = await fetch('/api/keywords/scan-drops', { method: 'POST' })
                const d = await r.json()
                setRefreshMsg({ ok: d.ok, text: d.ok ? `✅ ${d.message}` : `❌ ${d.error}` })
                if (d.ok) setTimeout(load, 3000)
              } catch (e) { setRefreshMsg({ ok: false, text: `❌ ${e.message}` }) }
            }}>
              🔍 Scan Drops
            </button>
            <button className="btn-primary" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? '⏳ Refreshing…' : '↻ Refresh Now'}
            </button>
          </div>
        }
      />

      {/* Stats row */}
      {stats && (
        <div className="stats-row">
          <div className="stat-card"><span className="stat-label">Total Keywords</span><strong className="stat-value">{stats.total}</strong></div>
          <div className="stat-card"><span className="stat-label">Top 3</span><strong className="stat-value" style={{ color: '#10b981' }}>{stats.top3}</strong></div>
          <div className="stat-card"><span className="stat-label">Top 10</span><strong className="stat-value" style={{ color: '#6ee7b7' }}>{stats.top10}</strong></div>
          <div className="stat-card"><span className="stat-label">Improving</span><strong className="stat-value" style={{ color: '#10b981' }}>▲ {stats.improving}</strong></div>
          <div className="stat-card"><span className="stat-label">Declining</span><strong className="stat-value" style={{ color: '#ef4444' }}>▼ {stats.declining}</strong></div>
          <div className="stat-card"><span className="stat-label">Critical Alerts</span><strong className="stat-value" style={{ color: stats.critical > 0 ? '#ef4444' : '#6b7280' }}>{stats.critical}</strong></div>
        </div>
      )}

      {/* Alerts */}
      <AlertBanner alerts={state.alerts} />

      {/* Filter + Search toolbar */}
      <div className="kw-toolbar">
        <div className="kw-filters">
          {[['all','All'], ['top10','Top 10'], ['improving','Improving ▲'], ['declining','Declining ▼'], ['critical','Critical 🚨']].map(([val, label]) => (
            <button key={val} className={`kw-filter-btn ${filter === val ? 'active' : ''}`} onClick={() => setFilter(val)}>{label}</button>
          ))}
        </div>
        <div className="kw-right-controls">
          <input
            className="kw-search"
            placeholder="Search keywords…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="kw-sort-select" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="rank">Sort: Rank</option>
            <option value="change">Sort: Change</option>
            <option value="volume">Sort: Volume</option>
            <option value="keyword">Sort: A–Z</option>
          </select>
        </div>
      </div>

      {/* Keywords table */}
      {keywords.length === 0 ? (
        <Empty icon="🔍" title="No keywords found" body="Try adjusting your filter or search." />
      ) : (
        <div className="kw-table">
          <div className="kw-table-header">
            <span className="kw-col-keyword">Keyword</span>
            <span className="kw-col-rank">Rank</span>
            <span className="kw-col-change">24h Change</span>
            <span className="kw-col-trend">30d Trend</span>
            <span className="kw-col-volume">Volume</span>
            <span className="kw-col-status">Status</span>
            <span className="kw-col-device">Device</span>
          </div>
          {keywords.map(kw => (
            <div key={kw.id} className="kw-row">
              <div className="kw-col-keyword">
                <span className="kw-keyword-text">{kw.keyword}</span>
                {kw.url && (
                  <a href={`https://genderrevealideas.com.au${kw.url}`} target="_blank" rel="noreferrer" className="kw-url-link">
                    {kw.url.replace(/^\/collections\/|^\/products\//, '').slice(0, 30)}
                  </a>
                )}
              </div>
              <div className="kw-col-rank"><RankBadge rank={kw.rank} /></div>
              <div className="kw-col-change"><ChangeChip change={kw.change} /></div>
              <div className="kw-col-trend"><Sparkline history={kw.history} /></div>
              <div className="kw-col-volume">{kw.volume ? kw.volume.toLocaleString() : '—'}</div>
              <div className="kw-col-status">
                <span className="kw-status-chip" style={{ color: KW_STATUS_COLOR[kw.status] || '#6b7280' }}>
                  {KW_STATUS_LABEL[kw.status] || kw.status}
                </span>
              </div>
              <div className="kw-col-device">
                <span className="kw-device-chip">{kw.device}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Blog Tasks Panel */}
      {blogTasks.length > 0 && (
        <div className="kw-blog-section">
          <div className="kw-blog-header">
            <h3 className="kw-blog-title">
              📝 Rank Recovery Articles
              <span className="kw-blog-count">{blogTasks.length}</span>
            </h3>
            <p className="kw-blog-sub">Auto-generated SEO articles for dropped keywords — approve to publish live to GRI blog</p>
          </div>
          {blogTasks.map(task => (
            <div key={task.id} className={`kw-blog-task kw-blog-${task.status}`}>
              <div className="kw-blog-task-header" onClick={() => setBlogExpanded(id => id === task.id ? null : task.id)}>
                <div className="kw-blog-task-left">
                  <span className="kw-blog-status-dot" />
                  <div>
                    <div className="kw-blog-task-keyword">"{task.keyword}"</div>
                    <div className="kw-blog-task-meta">
                      Dropped #{task.previousRank} → #{task.currentRank} · {task.drop} positions
                      {task.article && <> · <strong>{task.article.title?.slice(0, 60)}</strong></>}
                    </div>
                  </div>
                </div>
                <div className="kw-blog-task-right">
                  <span className={`kw-blog-badge kw-blog-badge-${task.status}`}>
                    {task.status === 'pending' && '⏳ Pending'}
                    {task.status === 'generating' && '🤖 Generating…'}
                    {task.status === 'draft' && '📄 Draft Ready'}
                    {task.status === 'generated' && '✍️ Generated'}
                    {task.status === 'published' && '✅ Published'}
                    {task.status === 'rejected' && '❌ Rejected'}
                    {task.status === 'failed' && '⚠️ Failed'}
                  </span>
                  <span className="kw-blog-expand">{blogExpanded === task.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {blogExpanded === task.id && (
                <div className="kw-blog-task-body">
                  {task.article && (
                    <>
                      <div className="kw-blog-article-meta">
                        <div><span className="kw-blog-label">META TITLE</span><span>{task.article.metaTitle}</span></div>
                        <div><span className="kw-blog-label">META DESC</span><span>{task.article.metaDescription}</span></div>
                        <div><span className="kw-blog-label">WORDS</span><span>~{task.article.wordCount || '1,500–2,000'}</span></div>
                        <div><span className="kw-blog-label">SLUG</span><code>/blogs/news/{task.article.slug}</code></div>
                      </div>
                      <div className="kw-blog-preview">
                        <div className="kw-blog-preview-label">ARTICLE PREVIEW (first 500 chars)</div>
                        <div className="kw-blog-preview-text">
                          {task.article.bodyHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500)}…
                        </div>
                      </div>
                    </>
                  )}
                  {task.error && <div className="kw-blog-error">⚠️ {task.error}</div>}

                  <div className="kw-blog-actions">
                    {task.shopify?.adminUrl && (
                      <a href={task.shopify.adminUrl} target="_blank" rel="noreferrer" className="btn-outline kw-blog-action-btn">
                        🔗 View in Shopify →
                      </a>
                    )}
                    {(task.status === 'draft' || task.status === 'generated') && (
                      <>
                        <button className="btn-primary kw-blog-action-btn" onClick={async () => {
                          const r = await fetch(`/api/keywords/blog-tasks/${task.id}/approve`, { method: 'POST' })
                          const d = await r.json()
                          if (d.ok) load()
                        }}>✅ Approve & Publish</button>
                        <button className="btn-outline kw-blog-action-btn" style={{color:'#f87171'}} onClick={async () => {
                          if (!confirm('Reject this article?')) return
                          await fetch(`/api/keywords/blog-tasks/${task.id}/reject`, { method: 'POST' })
                          load()
                        }}>❌ Reject</button>
                      </>
                    )}
                    {(task.status === 'failed' || task.status === 'pending') && (
                      <button className="btn-outline kw-blog-action-btn" onClick={async () => {
                        await fetch(`/api/keywords/blog-tasks/${task.id}/generate`, { method: 'POST' })
                        setTimeout(load, 2000)
                      }}>🔄 Regenerate</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="kw-footer-note">
        Data from Keyword.com · Project ID: IfZYQs3 · Auto-refreshes daily at 6:00am AEST · Drops scan triggers blog article generation
      </div>
    </div>
  )
}

// ── Competitor Tracker ────────────────────────────────────────────────────────

const COMP_COLORS = {
  gri:     '#ef4444',
  cel:     '#6366f1',
  aussie:  '#f97316',
  express: '#eab308',
}
const COMP_NAMES = {
  gri:     'GRI',
  cel:     'CelebrationHQ',
  aussie:  'Aussie Reveals',
  express: 'GR Express',
}

// ════════════════════════════════════════════════════════════════
// TRENDS INTELLIGENCE PAGE
// ════════════════════════════════════════════════════════════════

const TREND_COLORS = ['#ff6b9d','#7eb8f7','#ffb347','#a78bfa','#34d399','#f87171','#fbbf24','#818cf8']
const SPIKE_LABELS = { VOLUME_SURGE:'Volume Surge', BREAKOUT_RISING_QUERY:'Breakout Query', NEW_EMERGENCE:'New Emergence' }

function MiniSparkline({ data, color = '#7eb8f7', width = 80, height = 24 }) {
  if (!data || data.length < 2) return null
  const vals = data.map(d => d.value)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals)
  const range = max - min || 1
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ')
  return <svg width={width} height={height} style={{ display:'inline-block', verticalAlign:'middle' }}>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
  </svg>
}

function TrendsIntelligencePage() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [briefPanel, setBriefPanel] = useState(null)
  const [generatingBrief, setGeneratingBrief] = useState(null)
  const [visibleKws, setVisibleKws] = useState([])
  const [sortBy, setSortBy] = useState('current')
  const [error, setError] = useState(null)
  // Publish flow state
  const [publishedArticles, setPublishedArticles] = useState([])
  const [confirmModal, setConfirmModal] = useState(null)      // spike object pending confirmation
  const [previewArticle, setPreviewArticle] = useState(null)  // article object for preview panel
  const [previewLoading, setPreviewLoading] = useState(null)  // keyword being previewed
  const [publishLoading, setPublishLoading] = useState(null)  // keyword being published
  const [publishResult, setPublishResult] = useState(null)    // { liveUrl, title } on success
  const [publishError, setPublishError] = useState(null)

  const API = ''

  const load = useCallback(async () => {
    try {
      const [tRes, sRes, pRes] = await Promise.all([
        fetch(`${API}/api/trends`).then(r => r.json()),
        fetch(`${API}/api/trends/status`).then(r => r.json()),
        fetch(`${API}/api/publish/published-articles`).then(r => r.json()),
      ])
      if (tRes.ok && tRes.data) setData(tRes.data)
      if (sRes.ok) setStatus(sRes)
      if (pRes.ok) setPublishedArticles(pRes.articles || [])
      setError(null)
    } catch (e) { setError(e.message) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  useEffect(() => {
    if (data?.timeseries && visibleKws.length === 0) {
      const ranked = Object.entries(data.timeseries)
        .map(([kw, s]) => ({ kw, v: s.length ? s[s.length - 1].value : 0 }))
        .sort((a, b) => b.v - a.v)
      setVisibleKws(ranked.slice(0, 5).map(r => r.kw))
    }
  }, [data])

  async function triggerScan() {
    setScanning(true)
    try {
      await fetch(`${API}/api/trends/scan-now`, { method: 'POST' })
      const poll = setInterval(async () => {
        const s = await fetch(`${API}/api/trends/status`).then(r => r.json())
        if (!s.scanning) { clearInterval(poll); setScanning(false); load() }
      }, 3000)
    } catch { setScanning(false) }
  }

  async function generateBrief(keyword) {
    setGeneratingBrief(keyword)
    try {
      const r = await fetch(`${API}/api/trends/generate-brief`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
      })
      const j = await r.json()
      if (j.ok && j.brief) { setBriefPanel(j.brief); load() }
    } catch (e) { setError(e.message) }
    setGeneratingBrief(null)
  }

  async function handlePreviewArticle(spike) {
    setPreviewLoading(spike.keyword)
    setPreviewArticle(null)
    setPublishResult(null)
    setPublishError(null)
    try {
      const r = await fetch(`${API}/api/publish/preview-article`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spikeKeyword: spike.keyword }),
      })
      const j = await r.json()
      if (j.ok && j.article) {
        setPreviewArticle({ ...j.article, spikeKeyword: spike.keyword })
      } else {
        setPublishError(j.error || 'Preview failed')
      }
    } catch (e) { setPublishError(e.message) }
    setPreviewLoading(null)
  }

  function confirmPublish(spike) {
    setConfirmModal(spike)
  }

  async function executePublish(spike) {
    setConfirmModal(null)
    setPublishLoading(spike.keyword)
    setPublishResult(null)
    setPublishError(null)
    try {
      const r = await fetch(`${API}/api/publish/generate-and-publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spikeKeyword: spike.keyword }),
      })
      const j = await r.json()
      if (j.ok) {
        setPublishResult({ liveUrl: j.liveUrl, title: j.title, spikeKeyword: spike.keyword })
        load()
      } else {
        setPublishError(j.error || 'Publish failed')
      }
    } catch (e) { setPublishError(e.message) }
    setPublishLoading(null)
  }

  function toggleKeyword(kw) {
    setVisibleKws(prev => prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw].slice(-8))
  }

  // Build set of published keyword slugs for TermsTable badge
  const publishedKeywordSet = new Set(publishedArticles.map(a => a.spikeKeyword?.toLowerCase()))

  // Build ranked keywords table
  const kwRows = data?.timeseries ? Object.entries(data.timeseries).map(([kw, series]) => {
    const latest = series.length ? series[series.length - 1].value : 0
    const peak = Math.max(...series.map(s => s.value), 0)
    const prev4 = series.slice(-5, -1).map(s => s.value)
    const avg = prev4.length ? prev4.reduce((a, b) => a + b, 0) / prev4.length : 0
    const change = avg > 0 ? Math.round(((latest - avg) / avg) * 100) : 0
    const isSpike = (data.spikes || []).some(s => s.keyword === kw)
    const isPublished = publishedKeywordSet.has(kw.toLowerCase())
    const publishedRecord = publishedArticles.find(a => a.spikeKeyword?.toLowerCase() === kw.toLowerCase())
    const statusLabel = isPublished ? 'PUBLISHED' : isSpike ? 'SPIKE' : change > 15 ? 'RISING' : change < -15 ? 'FALLING' : 'STABLE'
    return { kw, latest, peak, change, statusLabel, series, publishedRecord }
  }).sort((a, b) => sortBy === 'peak' ? b.peak - a.peak : sortBy === 'change' ? b.change - a.change : b.latest - a.latest) : []

  // Chart data
  const chartData = (() => {
    if (!data?.timeseries || visibleKws.length === 0) return []
    const dateMap = {}
    for (const kw of visibleKws) {
      for (const pt of (data.timeseries[kw] || [])) {
        if (!dateMap[pt.date]) dateMap[pt.date] = { date: pt.date }
        dateMap[pt.date][kw] = pt.value
      }
    }
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
  })()

  const lastUpdated = data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' }) : 'Never'
  const demoMode = status?.demoMode

  return (
    <div className="trends-page">
      <PageHeader
        title="Trends Intelligence"
        subtitle={`Google Trends Australia | ${demoMode ? 'DEMO MODE' : 'Live Data — DataForSEO'} | Last scan: ${lastUpdated}`}
        actions={
          <button className="btn btn-primary" onClick={triggerScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Now'}
          </button>
        }
      />

      {error && <div className="error-bar">Error: {error}</div>}

      {/* ── Publish error/success banners ── */}
      {publishError && (
        <div className="publish-banner publish-banner-error">
          ✗ {publishError}
          <button onClick={() => setPublishError(null)}>✕</button>
        </div>
      )}
      {publishResult && (
        <div className="publish-banner publish-banner-success">
          ✅ Article published live!{' '}
          <a href={publishResult.liveUrl} target="_blank" rel="noopener">{publishResult.title}</a>
          <button onClick={() => setPublishResult(null)}>✕</button>
        </div>
      )}

      {/* ── Spike Alerts ── */}
      {(data?.spikes || []).length > 0 && (
        <div className="trends-spikes">
          {data.spikes.map((spike, i) => {
            const hasBrief = (data.blogBriefs || []).find(b => b.spikeKeyword === spike.keyword && !b.error)
            const isPublished = publishedKeywordSet.has(spike.keyword.toLowerCase())
            const pubRecord = publishedArticles.find(a => a.spikeKeyword?.toLowerCase() === spike.keyword.toLowerCase())
            const isPreviewing = previewArticle?.spikeKeyword === spike.keyword
            const isLoadingPreview = previewLoading === spike.keyword
            const isPublishing = publishLoading === spike.keyword
            return (
              <div key={i} className={`trends-spike-card ${isPreviewing ? 'spike-card-expanded' : ''}`}>
                <div className="spike-badge">{SPIKE_LABELS[spike.type] || spike.type}</div>
                <div className="spike-keyword">{spike.keyword}</div>
                <div className="spike-change">
                  {spike.changePercent ? `+${spike.changePercent}%` : spike.percentIncrease ? `+${spike.percentIncrease}%` : ''} above baseline
                </div>
                {spike.parentKeyword && <div className="spike-parent">via: {spike.parentKeyword}</div>}

                {isPublished ? (
                  <div className="spike-published-badge">
                    ✅ Published{' '}
                    {pubRecord?.liveUrl && <a href={pubRecord.liveUrl} target="_blank" rel="noopener" className="spike-live-link">View Live →</a>}
                  </div>
                ) : (
                  <div className="spike-actions">
                    <button className="btn btn-sm" onClick={() => isPreviewing ? setPreviewArticle(null) : handlePreviewArticle(spike)} disabled={isLoadingPreview || isPublishing}>
                      {isLoadingPreview ? 'Loading...' : isPreviewing ? 'Close Preview' : 'Preview Article'}
                    </button>
                    <button className="btn btn-sm btn-publish" onClick={() => confirmPublish(spike)} disabled={isPublishing || isLoadingPreview}>
                      {isPublishing ? 'Publishing...' : 'Generate and Publish Blog Live'}
                    </button>
                    {hasBrief && (
                      <button className="btn btn-sm btn-ghost" onClick={() => setBriefPanel(hasBrief)}>View Brief</button>
                    )}
                    {!hasBrief && (
                      <button className="btn btn-sm btn-ghost" onClick={() => generateBrief(spike.keyword)} disabled={generatingBrief === spike.keyword}>
                        {generatingBrief === spike.keyword ? '...' : 'Brief'}
                      </button>
                    )}
                  </div>
                )}

                {/* Article Preview Panel — inline below spike card */}
                {isPreviewing && previewArticle && (
                  <div className="article-preview-panel">
                    <div className="preview-serp">
                      <div className="serp-url">genderrevealideas.com.au › blogs › news › {previewArticle.handle}</div>
                      <div className="serp-title">{previewArticle.seo_title}</div>
                      <div className="serp-desc">{previewArticle.seo_description}</div>
                    </div>
                    <div className="preview-meta-row">
                      <div className="preview-meta-item">
                        <span className="preview-meta-label">Title</span>
                        <span className="preview-meta-val">{previewArticle.title}</span>
                      </div>
                      <div className="preview-meta-item">
                        <span className="preview-meta-label">Handle</span>
                        <span className="preview-meta-val preview-handle">/blogs/news/{previewArticle.handle}</span>
                      </div>
                      <div className="preview-meta-item">
                        <span className="preview-meta-label">SEO Title ({(previewArticle.seo_title || '').length} chars)</span>
                        <span className={`preview-meta-val ${(previewArticle.seo_title || '').length > 60 ? 'over-limit' : ''}`}>{previewArticle.seo_title}</span>
                      </div>
                      <div className="preview-meta-item">
                        <span className="preview-meta-label">Meta Desc ({(previewArticle.seo_description || '').length} chars)</span>
                        <span className={`preview-meta-val ${(previewArticle.seo_description || '').length > 155 ? 'over-limit' : ''}`}>{previewArticle.seo_description}</span>
                      </div>
                    </div>
                    <div className="preview-tags">
                      {(previewArticle.tags || []).map((t, ti) => <span key={ti} className="preview-tag">{t}</span>)}
                    </div>
                    <div className="preview-body" dangerouslySetInnerHTML={{ __html: previewArticle.body_html }} />
                    <div className="preview-actions">
                      <button className="btn btn-primary btn-publish" onClick={() => { setPreviewArticle(null); confirmPublish(spike) }} disabled={isPublishing}>
                        Publish This Article
                      </button>
                      <button className="btn" onClick={() => setPreviewArticle(null)}>Close Preview</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Stats Row ── */}
      <div className="trends-stats">
        <div className="stat-card"><div className="stat-value">{Object.keys(data?.timeseries || {}).length}</div><div className="stat-label">Keywords Tracked</div></div>
        <div className="stat-card"><div className="stat-value">{(data?.spikes || []).length}</div><div className="stat-label">Active Spikes</div></div>
        <div className="stat-card"><div className="stat-value">{(data?.risingQueries || []).length}</div><div className="stat-label">Rising Queries</div></div>
        <div className="stat-card"><div className="stat-value">{publishedArticles.length}</div><div className="stat-label">Articles Published</div></div>
      </div>

      {/* ── Trends Chart ── */}
      <div className="trends-chart-container">
        <h3>Search Interest Over Time</h3>
        <p className="trends-chart-sub">Google Trends Index | Past 12 months | Australia</p>
        {chartData.length > 0 ? (
          <div className="trends-chart">
            <svg viewBox="0 0 800 300" className="trends-svg">
              {[0, 25, 50, 75, 100].map(v => (
                <g key={v}>
                  <line x1="50" y1={280 - v * 2.6} x2="790" y2={280 - v * 2.6} stroke="#1e2330" strokeWidth="1" />
                  <text x="45" y={284 - v * 2.6} fill="#6b7280" fontSize="10" textAnchor="end">{v}</text>
                </g>
              ))}
              {chartData.filter((_, i) => i % Math.ceil(chartData.length / 6) === 0).map((pt, i) => (
                <text key={i} x={50 + (chartData.indexOf(pt) / Math.max(chartData.length - 1, 1)) * 740} y="298" fill="#6b7280" fontSize="9" textAnchor="middle">{pt.date.slice(5)}</text>
              ))}
              {visibleKws.map((kw, ki) => {
                const color = TREND_COLORS[ki % TREND_COLORS.length]
                const points = chartData.map((pt, i) => {
                  const x = 50 + (i / Math.max(chartData.length - 1, 1)) * 740
                  const y = 280 - (pt[kw] || 0) * 2.6
                  return `${x},${y}`
                }).join(' ')
                return <polyline key={kw} points={points} fill="none" stroke={color} strokeWidth="2" opacity="0.9" />
              })}
            </svg>
            <div className="trends-legend">
              {visibleKws.map((kw, ki) => (
                <span key={kw} className="legend-item" onClick={() => toggleKeyword(kw)}>
                  <span className="legend-dot" style={{ background: TREND_COLORS[ki % TREND_COLORS.length] }} />
                  {kw}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="trends-empty">No chart data yet. Run a scan to populate.</div>
        )}
      </div>

      {/* ── Keywords Table ── */}
      <div className="trends-table-container">
        <div className="trends-table-header">
          <h3>Keyword Rankings</h3>
          <div className="trends-sort">
            Sort:{' '}
            <button className={sortBy==='current'?'active':''} onClick={()=>setSortBy('current')}>Current</button>
            <button className={sortBy==='peak'?'active':''} onClick={()=>setSortBy('peak')}>Peak</button>
            <button className={sortBy==='change'?'active':''} onClick={()=>setSortBy('change')}>Change</button>
          </div>
        </div>
        <table className="trends-table">
          <thead>
            <tr><th>#</th><th>Search Term</th><th>Current</th><th>Peak</th><th>Trend</th><th>Change</th><th>Status</th><th>Chart</th></tr>
          </thead>
          <tbody>
            {kwRows.map((row, i) => (
              <tr key={row.kw} className={row.statusLabel === 'SPIKE' ? 'spike-row' : row.statusLabel === 'PUBLISHED' ? 'published-row' : ''}>
                <td className="rank-num">{i + 1}</td>
                <td className="kw-name">
                  <a href={`https://trends.google.com/trends/explore?date=today%203-m&geo=AU&q=${encodeURIComponent(row.kw)}`} target="_blank" rel="noopener">{row.kw}</a>
                </td>
                <td className="val">{row.latest}</td>
                <td className="val">{row.peak}</td>
                <td><MiniSparkline data={row.series.slice(-7)} color={row.change > 0 ? '#34d399' : '#f87171'} /></td>
                <td className={`val ${row.change > 0 ? 'pos' : row.change < 0 ? 'neg' : ''}`}>
                  {row.change > 0 ? '+' : ''}{row.change}%
                </td>
                <td>
                  {row.statusLabel === 'PUBLISHED' ? (
                    <span className="status-badge status-published" title={row.publishedRecord?.liveUrl ? `Article live at ${row.publishedRecord.liveUrl}` : 'Article published'}>
                      ✅ PUBLISHED
                    </span>
                  ) : (
                    <span className={`status-badge status-${row.statusLabel.toLowerCase()}`}>{row.statusLabel}</span>
                  )}
                </td>
                <td>
                  <button className={`chart-toggle ${visibleKws.includes(row.kw)?'on':''}`} onClick={() => toggleKeyword(row.kw)}>
                    {visibleKws.includes(row.kw) ? '●' : '○'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Rising Queries ── */}
      {(data?.risingQueries || []).length > 0 && (
        <div className="trends-rising">
          <h3>Rising Related Queries</h3>
          <div className="rising-grid">
            {data.risingQueries.slice(0, 12).map((rq, i) => (
              <div key={i} className="rising-card">
                <div className="rising-query">{rq.query}</div>
                <div className="rising-value">+{rq.extracted_value}%</div>
                <div className="rising-parent">from: {rq.parentKeyword}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Published Articles Feed ── */}
      <div className="published-feed">
        <h3>Published Articles</h3>
        {publishedArticles.length === 0 ? (
          <div className="published-empty">No articles published yet. Publish your first from a trend spike above.</div>
        ) : (
          <table className="published-table">
            <thead>
              <tr><th>Title</th><th>Spike Term</th><th>Published</th><th>Link</th></tr>
            </thead>
            <tbody>
              {publishedArticles.map((a, i) => (
                <tr key={i}>
                  <td className="pub-title">{a.articleTitle || a.title}</td>
                  <td className="pub-spike">{a.spikeKeyword}</td>
                  <td className="pub-date">{a.generatedAt ? new Date(a.generatedAt).toLocaleDateString('en-AU') : '—'}</td>
                  <td>
                    {a.liveUrl
                      ? <a href={a.liveUrl} target="_blank" rel="noopener" className="btn btn-sm btn-ghost">Open Live →</a>
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Blog Brief Slide-over ── */}
      {briefPanel && (
        <div className="brief-overlay" onClick={() => setBriefPanel(null)}>
          <div className="brief-panel" onClick={e => e.stopPropagation()}>
            <div className="brief-header">
              <h3>Blog Opportunity Brief</h3>
              <button className="brief-close" onClick={() => setBriefPanel(null)}>✕</button>
            </div>
            <div className="brief-meta">
              <span className="brief-keyword">{briefPanel.spikeKeyword}</span>
              <span className="brief-type">{SPIKE_LABELS[briefPanel.spikeType] || briefPanel.spikeType}</span>
              <span className="brief-time">{new Date(briefPanel.generatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}</span>
            </div>
            {briefPanel.error && <div className="brief-error">Error: {briefPanel.error}</div>}
            <pre className="brief-content">{briefPanel.brief}</pre>
            <div className="brief-actions">
              <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(briefPanel.brief || ''); alert('Brief copied') }}>Copy Brief</button>
              <button className="btn" onClick={() => setBriefPanel(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Publish Modal ── */}
      {confirmModal && (
        <div className="confirm-overlay" onClick={() => setConfirmModal(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="confirm-title">Publish This Article Live?</h3>
            <p className="confirm-body">
              This will generate a full SEO blog post and publish it immediately to genderrevealideas.com.au.
              The article will be live and indexed by Google within minutes.
              Confirm only when the trend spike is verified.
            </p>
            <div className="confirm-keyword">Spike term: <strong>{confirmModal.keyword}</strong></div>
            <div className="confirm-actions">
              <button className="btn btn-primary btn-publish" onClick={() => executePublish(confirmModal)}>
                Yes, Publish Live
              </button>
              <button className="btn" onClick={() => setConfirmModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Status Bar ── */}
      <div className="trends-status-bar">
        <span className={`status-dot ${status?.hasDataForSeo ? 'green' : 'amber'}`} />
        {demoMode ? 'Demo Mode' : 'DataForSEO Live'}
        {' | '}Last scan: {lastUpdated}
        {' | '}Monitoring {Object.keys(data?.timeseries || {}).length} keywords
        {' | '}{publishedArticles.length} articles published
        {scanning && ' | Scanning...'}
      </div>
    </div>
  )
}

function CompRankCell({ pos }) {
  if (!pos || pos.rank === null) return <span className="comp-rank unranked">—</span>
  const cls = pos.rank <= 3 ? 'top3' : pos.rank <= 10 ? 'top10' : pos.rank <= 20 ? 'top20' : ''
  return <span className={`comp-rank ${cls}`}>#{pos.rank}</span>
}

function CompetitorTrackerPage() {
  const [view, setView] = useState('market') // 'market', 'gsc', or 'manual'
  const [state, setState]       = useState({ status: 'loading' })
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg]   = useState(null)
  const [kwFilter, setKwFilter] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/competitors/rankings')
      const data = await res.json()
      setState(data)
    } catch (e) {
      setState({ status: 'error', error: e.message })
    }
  }, [])

  useEffect(() => { if (view === 'manual') load() }, [load, view])

  const handleScan = async () => {
    setScanning(true)
    setScanMsg(null)
    try {
      const res = await fetch('/api/competitors/scan', { method: 'POST' })
      const d = await res.json()
      setScanMsg({ ok: d.ok, text: d.ok ? `🔍 ${d.message}` : `❌ ${d.error}` })
      // Poll for results every 15s
      if (d.ok) {
        const poll = setInterval(async () => {
          const r = await fetch('/api/competitors/rankings')
          const data = await r.json()
          if (data.keywords?.length > 0) { setState(data); setScanMsg({ ok: true, text: '✅ Scan complete!' }); setScanning(false); clearInterval(poll) }
        }, 15000)
        setTimeout(() => { clearInterval(poll); setScanning(false) }, 300000) // 5min timeout
      } else {
        setScanning(false)
      }
    } catch (e) {
      setScanMsg({ ok: false, text: `❌ ${e.message}` })
      setScanning(false)
    }
  }

  const competitors = state.competitors || {}
  const compKeys = Object.keys(competitors)
  const keywords = (state.keywords || []).filter(k =>
    !kwFilter || k.keyword.toLowerCase().includes(kwFilter.toLowerCase())
  )
  const summary = state.summary || {}
  const updatedAt = state.updatedAt
    ? new Date(state.updatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <div className="page comp-page">
      <PageHeader
        title="Competitor Intelligence"
        subtitle="Your visibility vs top competitors in gender reveal space"
      />

      {/* View Toggle */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
        <button
          className={view === 'market' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setView('market')}
        >
          📊 Market Share
        </button>
        <button
          className={view === 'gsc' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setView('gsc')}
        >
          📈 Your Performance
        </button>
        <button
          className={view === 'manual' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setView('manual')}
        >
          ⚔️ Manual Scan
        </button>
      </div>

      {/* Market Share View */}
      {view === 'market' && <MarketShare />}

      {/* GSC View */}
      {view === 'gsc' && <GSCVisibility />}

      {/* Manual Scan View */}
      {view === 'manual' && (
        <>
          <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {scanMsg && <span className={`save-msg ${scanMsg.ok ? 'ok' : 'err'}`}>{scanMsg.text}</span>}
            <button className="btn-outline" onClick={load}>↻ Refresh</button>
            <button className="btn-primary" onClick={handleScan} disabled={scanning}>
              {scanning ? '⏳ Scanning…' : '⚔ Scan Competitors'}
            </button>
            {updatedAt && <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Last scan: {updatedAt}</span>}
          </div>

      {/* Competitor summary cards */}
      {compKeys.length > 0 && Object.keys(summary).length > 0 && (
        <div className="comp-summary-row">
          {compKeys.map(key => {
            const comp = competitors[key]
            const stats = summary[key] || {}
            const isGRI = key === 'gri'
            return (
              <div key={key} className={`comp-summary-card ${isGRI ? 'comp-summary-gri' : ''}`} style={{ borderColor: COMP_COLORS[key] + '44' }}>
                <div className="comp-summary-name" style={{ color: COMP_COLORS[key] }}>{comp.name}</div>
                <div className="comp-summary-domain">{comp.domain}</div>
                <div className="comp-summary-stats">
                  <div className="comp-summary-stat"><span>Top 3</span><strong style={{ color: '#34d399' }}>{stats.top3 ?? '—'}</strong></div>
                  <div className="comp-summary-stat"><span>Top 10</span><strong style={{ color: '#a5b4fc' }}>{stats.top10 ?? '—'}</strong></div>
                  <div className="comp-summary-stat"><span>Avg Rank</span><strong>#{stats.avgRank ?? '—'}</strong></div>
                  <div className="comp-summary-stat"><span>Ranked</span><strong>{stats.ranked ?? '—'}</strong></div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {state.status === 'empty' && (
        <div className="kw-setup-card">
          <div className="kw-setup-icon">⚔</div>
          <h3>No competitor data yet</h3>
          <p className="muted">Click <strong>Scan Competitors</strong> to check Google rankings for all 38 GRI keywords against CelebrationHQ, Aussie Reveals, and Gender Reveal Express.</p>
          <p className="muted" style={{ fontSize: '0.77rem' }}>Takes ~3 minutes. Scans Google.com.au for each keyword.</p>
        </div>
      )}

      {keywords.length > 0 && (
        <>
          <div className="comp-toolbar">
            <input
              className="kw-search"
              placeholder="Filter keywords…"
              value={kwFilter}
              onChange={e => setKwFilter(e.target.value)}
            />
            <span className="comp-showing">{keywords.length} keywords</span>
          </div>

          <div className="comp-table">
            {/* Header */}
            <div className="comp-table-header" style={{ gridTemplateColumns: `1fr repeat(${compKeys.length}, 90px)` }}>
              <span>Keyword</span>
              {compKeys.map(k => (
                <span key={k} style={{ color: COMP_COLORS[k] }}>{COMP_NAMES[k]}</span>
              ))}
            </div>

            {keywords.map(row => {
              // Find which site is winning this keyword
              const bestRank = Math.min(...compKeys.map(k => row.positions[k]?.rank ?? 999))
              return (
                <div key={row.keyword} className="comp-table-row" style={{ gridTemplateColumns: `1fr repeat(${compKeys.length}, 90px)` }}>
                  <div className="comp-kw-cell">
                    <span className="comp-kw-text">{row.keyword}</span>
                    {row.error && <span className="comp-kw-error" title={row.error}>⚠</span>}
                  </div>
                  {compKeys.map(k => {
                    const pos = row.positions[k]
                    const isWinner = pos?.rank !== null && pos?.rank === bestRank
                    return (
                      <div key={k} className={`comp-rank-cell ${isWinner ? 'comp-winner' : ''}`}>
                        {pos?.url
                          ? <a href={pos.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><CompRankCell pos={pos} /></a>
                          : <CompRankCell pos={pos} />
                        }
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="kw-footer-note" style={{ marginTop: 16 }}>
            Rankings scraped from Google.com.au · Positions 1–30 · Brisbane geolocation · {updatedAt} AEST
          </div>
        </>
      )}
        </>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [active,  setActive]  = useState('Overview')
  const [company, setCompany] = useState('GRI')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [editorTheme, setEditorTheme] = useState(null)

  const load = async c => {
    setLoading(true); setError('')
    try { setData(await fetchDashboard(c)) }
    catch (e) { setError(String(e?.message||e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(company) }, [company])

  const integ   = data?.integrations || {}
  const profile = COMPANIES[company] || COMPANIES.GRI

  const navIcons = { Overview:'◉', Tasks:'☑', Completed:'✅', Keywords:'📈', Competitors:'⚔', Trends:'📊', 'TNT Hire':'💥', Themes:'◈', 'Theme Editor':'✏', Settings:'⚙' }

  const goEditor = theme => { setEditorTheme(theme); setActive('Theme Editor') }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">Command Centre</div>
          <div className="brand-sub">AI Operations Layer</div>
        </div>

        <nav className="nav">
          {NAV.map(item => (
            <button key={item} className={`nav-item ${active===item?'active':''}`} onClick={()=>setActive(item)}>
              <span className="nav-icon">{navIcons[item]}</span>{item}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="footer-label">Active Brand</div>
          <div className="brand-btns">
            {Object.entries(COMPANIES).map(([c,p]) => (
              <button key={c} className={`brand-btn ${company===c?'active':''}`}
                style={company===c?{borderColor:p.accent,color:p.accent}:{}}
                onClick={()=>setCompany(c)}>{c}</button>
            ))}
          </div>
          <div className="status-dots">
            {['shopify','notion','slack'].map(k=>(
              <span key={k} className={`dot ${integ[k]?'on':'off'}`} title={k} />
            ))}
          </div>
        </div>
      </aside>

      <main className="main">
        {loading && <div className="loading"><div className="spinner"/>Loading…</div>}
        {error   && <div className="error-bar">⚠ {error}</div>}
        {!loading && !error && (
          <>
            {active==='Overview'     && <OverviewPage    data={data} company={company} />}
            {active==='Tasks'        && <TasksPage       data={data} />}
            {active==='Completed'    && <CompletedPage   data={data} />}
            {active==='Keywords'     && <KeywordTrackerPage />}
            {active==='Competitors'  && <CompetitorTrackerPage />}
            {active==='Trends'       && <TrendsIntelligencePage />}
            {active==='TNT Hire'    && <TNTDashboard />}
            {active==='Themes'       && <ThemesPage      data={data} onOpenEditor={goEditor} />}
            {active==='Theme Editor' && <ThemeEditorPage data={data} initialTheme={editorTheme} />}
            {active==='Settings'     && <SettingsPage    data={data} company={company} onCompanyChange={setCompany} />}
          </>
        )}
      </main>
    </div>
  )
}
