import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Line, ComposedChart
} from 'recharts'

// ── Dark Theme Colours (high contrast) ──────────────────────────────────────

const C = {
  bg: '#0D1117', card: '#161B22', border: '#30363D',
  text: '#E6EDF3', muted: '#8B949E',
  green: '#3FB950', red: '#F85149', yellow: '#D29922',
  blue: '#58A6FF', pink: '#E43F7B', purple: '#A371F7',
  orange: '#E3651D',
}

const API = '/api/flywheel'
const GRI_ADS_FE = { profitableCPP: 43.13, breakevenCPP: 50.74, grossMarginPct: 0.40 }
const RANGES = [
  { key: 'today', label: 'Today (Live)' },
  { key: '7d', label: '7 Days' },
  { key: '14d', label: '14 Days' },
  { key: '30d', label: '30 Days' },
]

function fmt$(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n) { return n != null && !isNaN(n) ? n.toFixed(1) + '%' : '--' }
function fmtX(n) { return n != null && !isNaN(n) ? n.toFixed(2) + 'x' : '--' }

// ── Mobile hook ─────────────────────────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return mobile
}

function useIsTablet() {
  const [tablet, setTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024)
  useEffect(() => {
    const handler = () => setTablet(window.innerWidth >= 768 && window.innerWidth < 1024)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return tablet
}

// ── Recommendation colours ──────────────────────────────────────────────────

const REC_COLORS = {
  SCALE: C.green, PROTECT: C.blue, KILL: C.red, REPLACE: C.pink, WATCH: C.yellow,
}
const ACTION_COLORS = {
  PAUSE: C.red, SCALE_BUDGET: C.green, REDUCE_BUDGET: C.yellow,
  REPLACE_CREATIVE: C.pink, REFRESH_AUDIENCE: C.purple,
}
const PRIORITY_COLORS = {
  URGENT: C.red, HIGH: C.orange, MEDIUM: C.yellow, LOW: C.muted,
}

// ── Main Component ──────────────────────────────────────────────────────────

export function AdsFlywheelTab() {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()

  const [range, setRange] = useState('today')
  const [d, setD] = useState(null) // dashboard data
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [expandedCamp, setExpandedCamp] = useState(null)
  const [scaleTarget, setScaleTarget] = useState(null) // { id, type:'adset'|'ad', name, budget, roas }
  const [scalePct, setScalePct] = useState(15)
  const [scaling, setScaling] = useState(false)
  const [scaleResult, setScaleResult] = useState(null)
  const [analyseAdName, setAnalyseAdName] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [audiences, setAudiences] = useState(null)
  const [launchPreview, setLaunchPreview] = useState(null)
  const [actionLoading, setActionLoading] = useState({}) // track per-button loading { [key]: true }
  const [creatingAudience, setCreatingAudience] = useState({}) // track per-template creating state
  const [expandedTemplate, setExpandedTemplate] = useState(null) // for interest/geo "View Config"

  // New: fatigue alerts, copy gen, duplicate
  const [fatigueAlerts, setFatigueAlerts] = useState([])
  const [showCopyGen, setShowCopyGen] = useState(false)
  const [copyAngle, setCopyAngle] = useState('')
  const [copyProduct, setCopyProduct] = useState('')
  const [copyVariants, setCopyVariants] = useState([])
  const [copyLoading, setCopyLoading] = useState(false)
  const [duplicateTarget, setDuplicateTarget] = useState(null)

  // Live refresh + auto-refresh
  const [liveData, setLiveData] = useState(null)
  const [liveRefreshing, setLiveRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Pre-launch modal
  const [activateTarget, setActivateTarget] = useState(null)
  const [activating, setActivating] = useState(false)

  // Resolve/Replace creative modal
  const [resolveTarget, setResolveTarget] = useState(null) // alert object being resolved
  const [replaceImageUrl, setReplaceImageUrl] = useState('')
  const [replaceCopyAngle, setReplaceCopyAngle] = useState('')
  const [replaceCopyProduct, setReplaceCopyProduct] = useState('')
  const [replaceCopyVariants, setReplaceCopyVariants] = useState([])
  const [replaceCopyLoading, setReplaceCopyLoading] = useState(false)
  const [replaceSelectedVariant, setReplaceSelectedVariant] = useState(null)
  const [replacing, setReplacing] = useState(false)
  const [oldCreativeSpec, setOldCreativeSpec] = useState(null) // fetched from Meta when modal opens
  const [uploadingCreative, setUploadingCreative] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null) // { name, type, url/videoId }
  const [uploadError, setUploadError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  // Decision history + winner scout
  const [decisionHistory, setDecisionHistory] = useState([])
  const [expandedDecision, setExpandedDecision] = useState(null)
  const [scoutRunning, setScoutRunning] = useState(false)

  // Campaign table own date range (independent of top-level)
  const [campRange, setCampRange] = useState('7d')
  const [campData, setCampData] = useState(null)
  const [campLoading, setCampLoading] = useState(false)

  // Auto-dismiss toast after 8 seconds
  const toastTimerRef = useRef(null)
  useEffect(() => {
    if (scaleResult) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setScaleResult(null), 8000)
    }
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }
  }, [scaleResult])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dashboard?range=${range}`).then(r => r.json())
      if (res.ok) setD(res)
      else setError(res.error || 'Failed to load')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [range])

  const loadAudiences = useCallback(async () => {
    try {
      const r = await fetch(`${API}/audiences`).then(r => r.json())
      if (r.ok) setAudiences(r)
    } catch (e) { /* silent */ }
  }, [])

  // Load dashboard on mount + 60s interval; load audiences only on mount
  useEffect(() => {
    setLoading(true)
    load()
    loadAudiences()
    const i = setInterval(load, 5 * 60 * 1000) // 5 min (was 60s — too aggressive for Meta rate limits)
    return () => clearInterval(i)
  }, [load, loadAudiences])

  // Action handlers
  async function resolveAlert(id) { await fetch(`${API}/alerts/${id}/resolve`, { method: 'POST' }); load() }
  async function approveAction(id) { await fetch(`${API}/actions/${id}/approve`, { method: 'POST' }); load() }
  async function rejectAction(id) { await fetch(`${API}/actions/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: '' }) }); load() }
  async function markDay(day) { await fetch(`${API}/rhythm/${day}/complete`, { method: 'POST' }); load() }

  async function triggerSync() { setSyncing(true); await fetch(`${API}/meta-sync/trigger`, { method: 'POST' }); setSyncing(false); load() }
  async function triggerBrief() { setGenerating(true); await fetch(`${API}/brief/generate`, { method: 'POST' }); setGenerating(false); load() }
  async function approveBrief(id) { await fetch(`${API}/brief/${id}/approve`, { method: 'POST' }); load() }
  async function runEngine() { await fetch(`${API}/decision-engine/run`, { method: 'POST' }); load() }

  async function executeScale(adSetId, pct) {
    setScaling(true); setScaleResult(null)
    try {
      const r = await fetch(`${API}/scale/${adSetId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ percentage: pct }) }).then(r => r.json())
      setScaleResult(r)
      if (r.ok) { setScaleTarget(null); load() }
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setScaling(false)
  }

  async function executeAction2(method, params, loadingKey) {
    if (loadingKey) setActionLoading(prev => ({ ...prev, [loadingKey]: true }))
    try {
      const r = await fetch(`${API}/execute-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params }),
      }).then(r => r.json())
      setScaleResult(r.ok
        ? { ok: true, message: `${method.replace(/([A-Z])/g, ' $1').trim()}: ${r.message || 'Done'}` }
        : { ok: false, error: r.error }
      )
      load()
    } catch (e) {
      setScaleResult({ ok: false, error: e.message })
    }
    if (loadingKey) setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
  }

  async function pauseAndReplace(adSetId, loadingKey) {
    if (loadingKey) setActionLoading(prev => ({ ...prev, [loadingKey]: true }))
    try {
      setScaleResult({ ok: true, message: 'Creating fresh audiences and pausing saturated one...' })
      const r = await fetch(`${API}/audiences/pause-and-replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adSetId }),
      }).then(r => r.json())
      setScaleResult(r.ok
        ? { ok: true, message: `Paused & replaced! ${r.newAudiences?.length || 0} fresh audiences created. ${r.instruction}` }
        : { ok: false, error: r.error }
      )
      load()
    } catch (e) {
      setScaleResult({ ok: false, error: e.message })
    }
    if (loadingKey) setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
  }

  async function createAudienceFromTemplate(templateId) {
    setCreatingAudience(prev => ({ ...prev, [templateId]: true }))
    try {
      setScaleResult({ ok: true, message: `Creating audience "${templateId}"...` })
      const r = await fetch(`${API}/audiences/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      }).then(r => r.json())
      if (r.ok) {
        // For retargeting/lookalike, also launch the ad set
        const template = (audiences?.templates || []).find(t => t.id === templateId)
        if (template && (template.type === 'retargeting' || template.type === 'lookalike')) {
          setScaleResult({ ok: true, message: `Audience created! Now launching test ad set ($10/day, PAUSED)...` })
          try {
            const launch = await fetch(`${API}/launch/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audienceName: template.name,
                audienceType: template.type,
                dailyBudget: 10,
                customAudienceId: r.audience?.metaAudienceId,
              }),
            }).then(r => r.json())
            setScaleResult(launch.ok
              ? { ok: true, message: `"${template.name}" ready! Ad set created PAUSED in testing campaign ($10/day). Review in Meta Ads Manager and activate when ready.` }
              : { ok: true, message: `Audience created on Meta but ad set launch failed: ${launch.error}. You can create the ad set manually.` }
            )
          } catch (launchErr) {
            setScaleResult({ ok: true, message: `Audience created on Meta! Ad set auto-launch failed: ${launchErr.message}. Create the ad set manually.` })
          }
        } else {
          setScaleResult({ ok: true, message: `Audience "${r.audience?.name}" created on Meta!` })
        }
      } else {
        setScaleResult({ ok: false, error: r.error })
      }
      loadAudiences()
    } catch (e) {
      setScaleResult({ ok: false, error: e.message })
    }
    setCreatingAudience(prev => ({ ...prev, [templateId]: false }))
  }

  async function previewAudienceLaunch(template) {
    try {
      const r = await fetch(`${API}/launch/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audienceName: template.name,
          audienceType: template.type,
          dailyBudget: 10,
          customAudienceId: template.metaAudienceId,
        }),
      }).then(r => r.json())
      if (r.ok) setLaunchPreview({ templateId: template.id, ...r.preview })
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
  }

  async function killAudienceAction(templateId) {
    setActionLoading(prev => ({ ...prev, [`kill-aud-${templateId}`]: true }))
    try {
      const r = await fetch(`${API}/audiences/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      }).then(r => r.json())
      setScaleResult(r.ok ? { ok: true, message: `Audience killed and ad set paused.` } : { ok: false, error: r.error })
      loadAudiences()
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setActionLoading(prev => ({ ...prev, [`kill-aud-${templateId}`]: false }))
  }

  async function scaleAudienceAction(templateId) {
    setActionLoading(prev => ({ ...prev, [`scale-aud-${templateId}`]: true }))
    try {
      const r = await fetch(`${API}/audiences/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      }).then(r => r.json())
      setScaleResult(r.ok ? { ok: true, message: `Audience scaled! Budget: $${r.previousBudget} → $${r.newBudget} (+15%)` } : { ok: false, error: r.error })
      loadAudiences()
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setActionLoading(prev => ({ ...prev, [`scale-aud-${templateId}`]: false }))
  }

  async function evaluateAudiences() {
    setActionLoading(prev => ({ ...prev, evalAudiences: true }))
    try {
      const r = await fetch(`${API}/audiences/evaluate`, { method: 'POST' }).then(r => r.json())
      if (r.ok) setScaleResult({ ok: true, message: `Evaluated ${r.results?.length || 0} audiences` })
      loadAudiences()
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setActionLoading(prev => ({ ...prev, evalAudiences: false }))
  }

  async function analyseCreative(name) {
    setAnalysing(true); setAnalysis(null)
    try {
      const r = await fetch(`${API}/analyse-creative`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adName: name }) }).then(r => r.json())
      setAnalysis(r.ok ? r.analysis : { error: r.error })
    } catch (e) { setAnalysis({ error: e.message }) }
    setAnalysing(false)
  }

  // Fatigue alerts
  async function loadFatigueAlerts() {
    try {
      const r = await fetch(`${API}/fatigue-alerts`).then(r => r.json())
      if (r.ok) setFatigueAlerts(r.alerts || [])
    } catch { /* silent */ }
  }
  async function ackFatigueAlert(id) {
    await fetch(`${API}/fatigue-alerts/${id}/ack`, { method: 'POST' })
    setFatigueAlerts(prev => prev.filter(a => a.id !== id))
  }

  // Copy generation
  async function generateCopy() {
    setCopyLoading(true); setCopyVariants([])
    try {
      const r = await fetch(`${API}/generate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angle: copyAngle, product: copyProduct })
      }).then(r => r.json())
      if (r.ok) setCopyVariants(r.variants || [])
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setCopyLoading(false)
  }

  // Duplicate ad
  async function doDuplicateAd(sourceAdId, name) {
    setActionLoading(prev => ({ ...prev, [`dup-${sourceAdId}`]: true }))
    try {
      const r = await fetch(`${API}/duplicate-ad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceAdId, newName: `${name} [Dup]` })
      }).then(r => r.json())
      setScaleResult(r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error })
      load()
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setActionLoading(prev => ({ ...prev, [`dup-${sourceAdId}`]: false }))
  }

  // Duplicate adset
  async function doDuplicateAdSet(sourceAdSetId, name) {
    setActionLoading(prev => ({ ...prev, [`dup-as-${sourceAdSetId}`]: true }))
    try {
      const r = await fetch(`${API}/duplicate-adset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceAdSetId, newName: `${name} [Dup]` })
      }).then(r => r.json())
      setScaleResult(r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error })
      load()
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setActionLoading(prev => ({ ...prev, [`dup-as-${sourceAdSetId}`]: false }))
  }

  // Create ad from AI copy directly into adset
  async function createAdFromCopy(adsetId, angle, product) {
    setActionLoading(prev => ({ ...prev, 'create-ad-copy': true }))
    try {
      const r = await fetch(`${API}/create-ad-from-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adsetId, angle, product })
      }).then(r => r.json())
      setScaleResult(r.ok
        ? { ok: true, message: `${r.message}\n\nCopy: "${r.copy?.primaryText}"` }
        : { ok: false, error: r.error }
      )
      load()
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setActionLoading(prev => ({ ...prev, 'create-ad-copy': false }))
  }

  // Live refresh (fresh Meta API pull)
  async function doLiveRefresh() {
    setLiveRefreshing(true)
    try {
      const r = await fetch(`${API}/live-refresh`).then(r => r.json())
      if (r.ok) setLiveData(r)
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setLiveRefreshing(false)
  }

  // Activate ad (pre-launch → set live)
  async function doActivateAd() {
    if (!activateTarget) return
    setActivating(true)
    try {
      const r = await fetch(`${API}/activate-ad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activateTarget)
      }).then(r => r.json())
      setScaleResult(r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error })
      setActivateTarget(null)
      load()
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setActivating(false)
  }

  // Auto-refresh (2 min interval)
  useEffect(() => {
    if (!autoRefresh) return
    const iv = setInterval(doLiveRefresh, 5 * 60 * 1000) // 5 min (was 2 min — respects Meta rate limits)
    doLiveRefresh() // immediate first pull
    return () => clearInterval(iv)
  }, [autoRefresh])

  // Generate replacement copy for resolve modal (with fatigued ad context)
  async function generateReplacementCopy() {
    setReplaceCopyLoading(true); setReplaceCopyVariants([])
    try {
      const r = await fetch(`${API}/generate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          angle: replaceCopyAngle,
          product: replaceCopyProduct,
          // Pass replacement context so AI keeps the same hook direction
          isReplacement: true,
          oldAngle: resolveTarget?.creativeAngle || '',
          audienceType: resolveTarget?.audience || '',
          formatType: resolveTarget?.formatType || '',
        })
      }).then(r => r.json())
      if (r.ok) setReplaceCopyVariants(r.variants || [])
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setReplaceCopyLoading(false)
  }

  // Execute the full PAUSE → REPLACE → ACTIVATE flow (single atomic call)
  async function executeReplace() {
    if (!resolveTarget || !replaceSelectedVariant) return
    setReplacing(true)
    try {
      const v = replaceSelectedVariant
      const alert = resolveTarget

      // Use adSetId/campaignId from the alert (enriched at kill-rule time)
      // Fall back to scanning dashboard data if alert doesn't have them
      let adSetId = alert.adSetId || ''
      let adSetName = ''
      let campaignId = alert.campaignId || ''
      let campaignName = ''

      // Resolve names from dashboard data
      for (const c of d?.campaigns || []) {
        if (campaignId && c.id === campaignId) {
          campaignName = c.name || ''
          const adSets = c.adSets || c.adsets || []
          for (const as of adSets) {
            if ((as.id || as.metaAdSetId) === adSetId) {
              adSetName = as.name || ''
              break
            }
          }
          break
        }
      }

      // Single atomic call: pause → swap creative → capture baseline → activate → track
      const result = await fetch(`${API}/pause-replace-activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adId: alert.entityId,
          adSetId,
          campaignId,
          adName: alert.entityName || alert.title,
          adSetName,
          campaignName,
          primaryText: v.primaryText,
          headline: v.headline,
          description: v.description,
          imageUrl: replaceImageUrl || undefined
        })
      }).then(r => r.json())

      // Resolve the alert
      await fetch(`${API}/alerts/${alert.id}/resolve`, { method: 'POST' })

      setScaleResult(result.ok
        ? { ok: true, message: result.message }
        : { ok: false, error: result.error }
      )

      // Reset modal
      setResolveTarget(null)
      setReplaceImageUrl('')
      setReplaceCopyAngle('')
      setReplaceCopyVariants([])
      setReplaceSelectedVariant(null)
      load()
    } catch (e) {
      setScaleResult({ ok: false, error: e.message })
    }
    setReplacing(false)
  }

  // Campaign table data (own date range)
  async function loadCampData(dateRange) {
    setCampLoading(true)
    try {
      const resp = await fetch(`/api/ads/performance?dateRange=${dateRange || campRange}`)
      const json = await resp.json()
      if (json.ok) setCampData(json)
    } catch (err) { console.error('Campaign data fetch error:', err) }
    setCampLoading(false)
  }

  useEffect(() => { loadCampData(campRange) }, [campRange])

  // Decision history
  async function loadDecisionHistory() {
    try {
      const r = await fetch(`${API}/decision-history`).then(r => r.json())
      if (r.ok) setDecisionHistory(r.decisions || [])
    } catch { /* silent */ }
  }

  // Manual winner scout run
  async function runWinnerScout() {
    setScoutRunning(true)
    try {
      const r = await fetch(`${API}/winner-scout/run`, { method: 'POST' }).then(r => r.json())
      setScaleResult(r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error })
      loadDecisionHistory()
      load() // refresh dashboard for updated winnerStats
    } catch (e) { setScaleResult({ ok: false, error: e.message }) }
    setScoutRunning(false)
  }

  // Load fatigue alerts + decision history on mount
  useEffect(() => { loadFatigueAlerts(); loadDecisionHistory() }, [])

  if (loading) return <div style={{ background: C.bg, color: C.muted, padding: 60, textAlign: 'center', minHeight: '100vh' }}>Loading flywheel...</div>
  if (error && !d) return <div style={{ background: C.bg, color: C.red, padding: 40, minHeight: '100vh' }}>Error: {error}</div>

  const h = d?.hero || {}
  const today = new Date()
  const dayOfWeek = today.getDay()

  return (
    <div style={{ background: C.bg, color: C.text, padding: isMobile ? '12px 10px 40px' : '20px 20px 40px', minHeight: '100vh', colorScheme: 'dark' }}>

      {/* ── 1. Header + Date Range ────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 0, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, margin: 0, color: C.text }}>Ads Intelligence Flywheel</h1>
          <p style={{ color: C.muted, margin: '2px 0 0', fontSize: 12 }}>Every purchase makes the next brief smarter</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{
              background: range === r.key ? C.blue : C.card,
              color: range === r.key ? '#fff' : C.muted,
              border: `1px solid ${range === r.key ? C.blue : C.border}`,
              borderRadius: 6, padding: isMobile ? '8px 14px' : '6px 14px', fontSize: 12, fontWeight: range === r.key ? 700 : 500, cursor: 'pointer',
              minHeight: isMobile ? 44 : 'auto',
            }}>{r.label}</button>
          ))}
          <button onClick={doLiveRefresh} disabled={liveRefreshing} style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}>{liveRefreshing ? 'Refreshing...' : 'Live Refresh'}</button>
          <button onClick={() => setAutoRefresh(!autoRefresh)} style={{ ...btnStyle(autoRefresh ? C.green : C.muted), minHeight: isMobile ? 44 : 'auto' }}>Auto: {autoRefresh ? 'ON' : 'OFF'}</button>
          <button onClick={triggerSync} disabled={syncing} style={{ ...btnStyle(C.blue), minHeight: isMobile ? 44 : 'auto' }}>{syncing ? 'Syncing...' : 'Sync Meta'}</button>
          <button onClick={runEngine} style={{ ...btnStyle(C.purple), minHeight: isMobile ? 44 : 'auto' }}>Run AI Engine</button>
        </div>
      </div>

      {/* ── Data Freshness Indicator ──────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6, fontSize: 10, color: C.muted }}>
        {d?.dataFetchedAt && <span>Dashboard: {new Date(d.dataFetchedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>}
        {liveData?.fetchedAt && <span style={{ color: C.green }}>Live: {new Date(liveData.fetchedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>}
        {autoRefresh && <span style={{ color: C.green }}>Auto-refresh ON (5min)</span>}
      </div>

      {/* ── 2. Revenue + Spend Cards ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 10 }}>

        {/* Revenue Attribution Card */}
        {(() => {
          const total = h.shopifyRevenue || 0
          const meta = h.metaRevenue || 0
          const google = h.googleRevenue || 0
          const organic = h.organicRevenue || 0
          const metaPct = total > 0 ? (meta / total * 100) : 0
          const googlePct = total > 0 ? (google / total * 100) : 0
          const organicPct = total > 0 ? (organic / total * 100) : 0
          return (
            <div style={{ ...card, padding: isMobile ? 14 : 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Revenue Attribution</div>
                <div style={{ fontSize: 10, color: C.muted }}>{h.shopifyOrders || 0} orders</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 14 }}>{fmt$(total)}</div>

              {/* Stacked bar */}
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 14, background: C.bg }}>
                {metaPct > 0 && <div style={{ width: `${metaPct}%`, background: '#1877F2', transition: 'width 0.5s' }} />}
                {googlePct > 0 && <div style={{ width: `${googlePct}%`, background: '#FBBC05', transition: 'width 0.5s' }} />}
                {organicPct > 0 && <div style={{ width: `${organicPct}%`, background: C.green, transition: 'width 0.5s' }} />}
              </div>

              {/* Breakdown rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: '#1877F2', flexShrink: 0 }} />
                    <MetaLogo />
                    <span style={{ fontSize: 12, color: C.text }}>Meta</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmt$(meta)}</span>
                    <span style={{ fontSize: 11, color: C.muted, minWidth: 36, textAlign: 'right' }}>{metaPct.toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: '#FBBC05', flexShrink: 0 }} />
                    <GoogleLogo />
                    <span style={{ fontSize: 12, color: C.text }}>Google</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmt$(google)}</span>
                    <span style={{ fontSize: 11, color: C.muted, minWidth: 36, textAlign: 'right' }}>{googlePct.toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: C.text, marginLeft: 22 }}>Organic / Direct</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>{fmt$(organic)}</span>
                    <span style={{ fontSize: 11, color: C.muted, minWidth: 36, textAlign: 'right' }}>{organicPct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Ad Spend Card */}
        {(() => {
          const total = h.totalSpend || 0
          const meta = h.metaSpend || 0
          const google = h.googleSpend || 0
          const metaPct = total > 0 ? (meta / total * 100) : 0
          const googlePct = total > 0 ? (google / total * 100) : 0
          return (
            <div style={{ ...card, padding: isMobile ? 14 : 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ad Spend</div>
                <div style={{ fontSize: 10, color: h.googleHasData ? C.green : C.yellow }}>{h.googleHasData ? 'Both channels active' : 'Meta only'}</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 14 }}>{fmt$(total)}</div>

              {/* Stacked bar */}
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 14, background: C.bg }}>
                {metaPct > 0 && <div style={{ width: `${metaPct}%`, background: C.pink, transition: 'width 0.5s' }} />}
                {googlePct > 0 && <div style={{ width: `${googlePct}%`, background: '#FBBC05', transition: 'width 0.5s' }} />}
              </div>

              {/* Breakdown rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: C.pink, flexShrink: 0 }} />
                    <MetaLogo />
                    <span style={{ fontSize: 12, color: C.text }}>Meta</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmt$(meta)}</span>
                    <span style={{ fontSize: 11, color: C.muted, minWidth: 36, textAlign: 'right' }}>{metaPct.toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: '#FBBC05', flexShrink: 0 }} />
                    <GoogleLogo />
                    <span style={{ fontSize: 12, color: C.text }}>Google</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmt$(google)}</span>
                    <span style={{ fontSize: 11, color: C.muted, minWidth: 36, textAlign: 'right' }}>{googlePct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Key Metrics Row ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: 10, marginBottom: 10 }}>
        <HeroCard label="nCAC" value={h.ncac != null ? fmt$(h.ncac) : '--'} sub={h.newCustomerCount ? `${h.newCustomerCount} new customers` : 'No customer data'} color={h.ncac != null ? (h.ncac <= 50.74 ? C.green : h.ncac <= 65 ? C.yellow : C.red) : C.muted} />
        <HeroCard label="MER" value={fmtX(h.mer)} sub="Target: 3.0x" color={h.mer >= 3.0 ? C.green : h.mer >= 2.50 ? C.yellow : C.red} />
        <div style={card}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Channel ROAS</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <MetaLogo />
            <span style={{ fontSize: 20, fontWeight: 700, color: h.roas >= 2.50 ? C.green : C.red }}>{fmtX(h.roas)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GoogleLogo />
            <span style={{ fontSize: 20, fontWeight: 700, color: h.googleSpend > 0 ? ((h.googleRevenue || 0) / h.googleSpend >= 2.50 ? C.green : C.red) : C.muted }}>{h.googleSpend > 0 ? fmtX((h.googleRevenue || 0) / h.googleSpend) : '--'}</span>
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Layer 4 — channel proxy</div>
        </div>
        <HeroCard label="CPA" value={fmt$(h.cpa)} sub="All orders (not nCAC)" color={h.cpa <= 43.13 ? C.green : h.cpa <= 50.74 ? C.yellow : C.red} />
        <HeroCard label="AOV" value={fmt$(h.aov)} sub="Target: $130" color={h.aov >= 130 ? C.green : h.aov >= 100 ? C.yellow : C.red} />
        <HeroCard label="Gross Profit" value={fmt$(h.profit)} sub="After all ad spend" color={h.profit > 0 ? C.green : C.red} />
      </div>

      {/* AMER + Bundle row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <HeroCard label="AMER" value={h.amer != null ? h.amer.toFixed(0) + '%' : '--'} sub="Ad margin efficiency" color={h.amer > 0 ? C.green : C.red} />
        <HeroCard label="Bundle Rate" value={h.bundleRateRange != null ? fmtPct(h.bundleRateRange) : '--'} sub={h.bundleOrdersRange != null ? `${h.bundleOrdersRange} of ${h.shopifyOrders} orders` : 'Target: 30%+'} color={h.bundleRateRange != null ? (h.bundleRateRange >= 30 ? C.green : C.yellow) : C.muted} />
        <HeroCard label="Orders Today" value={range === 'today' ? (h.shopifyOrders || 0) : '--'} sub="From Shopify" color={C.text} />
      </div>

      {/* ── Winner Scout Card ────────────────────────────────────────────── */}
      {d?.winnerStats && d.winnerStats.totalWinners > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
          <div style={{ ...card, borderTop: `3px solid ${C.green}` }}>
            <div style={{ fontSize: 10, color: C.muted }}>Winners Found</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: C.green }}>{d.winnerStats.totalWinners}</div>
          </div>
          <div style={{ ...card, borderTop: `3px solid ${C.green}` }}>
            <div style={{ fontSize: 10, color: C.muted }}>Avg Winner CPA</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: C.green }}>{fmt$(d.winnerStats.avgCpa)}</div>
          </div>
          <div style={{ ...card, borderTop: `3px solid ${C.green}` }}>
            <div style={{ fontSize: 10, color: C.muted }}>Best Angle</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{d.winnerStats.bestAngle}</div>
          </div>
          <div style={{ ...card, borderTop: `3px solid ${C.green}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <button onClick={runWinnerScout} disabled={scoutRunning} style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}>
              {scoutRunning ? 'Scanning...' : 'Run Winner Scout'}
            </button>
          </div>
        </div>
      )}

      {/* ── nCAC Framework Metrics ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>nCAC Framework</span>
          <span style={{ flex: 1, height: 1, background: C.border }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10 }}>
          <HeroCard
            label="CM$"
            value={h.cm != null ? fmt$(h.cm) : '--'}
            sub="Layer 1 scoreboard"
            color={h.cm != null ? (h.cm > 0 ? C.green : C.red) : C.muted}
          />
          <HeroCard
            label="FOV/CAC"
            value={h.fovCac != null ? fmtX(h.fovCac) : '--'}
            sub="First-order profit vs cost"
            color={h.fovCac != null ? (h.fovCac >= 3.0 ? C.green : h.fovCac >= 1.0 ? C.yellow : C.red) : C.muted}
          />
          <HeroCard
            label="aMER"
            value={h.acquisitionMer != null ? fmtX(h.acquisitionMer) : '--'}
            sub="New customer efficiency"
            color={h.acquisitionMer != null ? (h.acquisitionMer >= 5.0 ? C.green : h.acquisitionMer >= 2.0 ? C.yellow : C.red) : C.muted}
          />
          <HeroCard
            label="New Cust/Day"
            value={h.newCustomersPerDay != null ? h.newCustomersPerDay.toFixed(1) : '--'}
            sub="Growth velocity"
            color={h.newCustomersPerDay != null ? (h.newCustomersPerDay >= 5 ? C.green : h.newCustomersPerDay >= 2 ? C.yellow : C.red) : C.muted}
          />
        </div>
      </div>

      {/* ── Scale Result Toast ─────────────────────────────────────────────── */}
      {scaleResult && (
        <div style={{ ...card, marginBottom: 12, borderLeft: `3px solid ${scaleResult.ok ? C.green : C.red}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: C.text }}>{scaleResult.ok ? scaleResult.message : `Action failed: ${scaleResult.error}`}</span>
            <button onClick={() => setScaleResult(null)} style={{ ...btnSm, cursor: 'pointer', minHeight: isMobile ? 44 : 'auto' }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* ── 3. Alerts + AI Actions ─────────────────────────────────────────── */}
      {(d?.alerts?.length > 0 || d?.pendingActions?.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          {d.pendingActions?.map(a => (
            <div key={a.id} style={{ ...card, borderLeft: `3px solid ${a.riskLevel === 'high' ? C.red : C.green}`, marginBottom: 6 }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: isMobile ? 8 : 0 }}>
                <div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                    <span style={badge(a.aiConfidence >= 7 ? C.green : C.yellow)}>Confidence {a.aiConfidence}/10</span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{a.actionTitle}</span>
                  </div>
                  <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>{a.actionSummary}</p>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => approveAction(a.id)} style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}>Approve</button>
                  <button onClick={() => rejectAction(a.id)} style={{ ...btnStyle(C.red), minHeight: isMobile ? 44 : 'auto' }}>Reject</button>
                </div>
              </div>
            </div>
          ))}
          {d.alerts?.map(a => (
            <div key={a.id} style={{ ...card, borderLeft: `3px solid ${a.severity === 'critical' ? C.red : a.severity === 'warning' ? C.yellow : C.blue}`, marginBottom: 4, padding: '8px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={badge(a.severity === 'critical' ? C.red : a.severity === 'warning' ? C.yellow : C.blue)}>{a.severity}</span>
                  <span style={{ fontSize: 13, color: C.text }}>{a.title}</span>
                </div>
                <button onClick={async () => {
                  setResolveTarget(a)
                  setReplaceCopyAngle(a.creativeAngle && a.creativeAngle !== 'unknown' ? a.creativeAngle : '')
                  setReplaceCopyProduct(a.productCategory && a.productCategory !== 'blended' ? a.productCategory : '')
                  setReplaceCopyVariants([])
                  setReplaceSelectedVariant(null)
                  setReplaceImageUrl('')
                  setOldCreativeSpec(null)
                  setUploadedFile(null)
                  setUploadingCreative(false)
                  setUploadError(null)
                  setDragOver(false)
                  // Fetch the old ad's creative spec from Meta (format, media type, copy)
                  if (a.entityId) {
                    try {
                      const r = await fetch(`${API}/ad-creative-spec/${a.entityId}`).then(r => r.json())
                      if (r.ok) setOldCreativeSpec(r.spec)
                    } catch { /* silent — modal still works without it */ }
                  }
                }} style={{ ...btnStyle(C.pink), cursor: 'pointer', minHeight: isMobile ? 44 : 'auto' }}>Pause & Replace</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 4. Campaign Table (expandable with surgical actions) ────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: C.text }}>Campaign Health</h2>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[{ key: 'today', label: 'Today' }, { key: '7d', label: '7d' }, { key: '14d', label: '14d' }, { key: '30d', label: '30d' }].map(r => (
              <button key={r.key} onClick={() => setCampRange(r.key)} style={{
                background: campRange === r.key ? C.blue : C.card,
                color: campRange === r.key ? '#fff' : C.muted,
                border: `1px solid ${campRange === r.key ? C.blue : C.border}`,
                borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: campRange === r.key ? 700 : 500, cursor: 'pointer',
                minHeight: isMobile ? 44 : 'auto',
              }}>{r.label}</button>
            ))}
            {campLoading && <span style={{ fontSize: 10, color: C.blue, alignSelf: 'center', marginLeft: 4 }}>Loading...</span>}
          </div>
        </div>
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={tbl}>
            <thead><tr>
              <th style={th}></th><th style={th}>Campaign</th><th style={th}>Budget/day</th>
              <th style={th}>Spend</th><th style={th}>Purchases</th><th style={th}>CPA</th>
              <th style={th}>Freq</th><th style={th}>Score</th><th style={th}>Status</th><th style={th}>Actions</th>
            </tr></thead>
            <tbody>
              {(d?.campaigns || []).map((c, i) => {
                // Use campData (from date selector) if available, fall back to flywheel data
                const campMatch = campData?.campaigns?.find(cc => cc.id === c.id)
                const m = campMatch?.insights || c.health?.metrics || {}
                const statusColor = { SCALE_READY: C.green, HEALTHY: C.blue, WATCH: C.yellow, KILL_SIGNAL: C.red, NO_DATA: C.muted }
                const isExpanded = expandedCamp === i
                const actionCount = (c.surgicalActions || []).length
                const cpa = m.purchases > 0 ? (m.spend / m.purchases) : (m.cpa || 0)
                const freq = m.frequency || 0
                return (
                  <>
                    <tr key={`camp-${i}`} onClick={() => setExpandedCamp(isExpanded ? null : i)} style={{ cursor: 'pointer', background: isExpanded ? '#1C2333' : 'transparent' }}>
                      <td style={td}><span style={{ color: C.muted }}>{isExpanded ? '\u25BC' : '\u25B6'}</span></td>
                      <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                      <td style={td}>{fmt$(campMatch?.dailyBudget || c.dailyBudget || c.budget)}</td>
                      <td style={td}>{fmt$(m.spend)}</td>
                      <td style={td}>{m.purchases || 0}</td>
                      <td style={{ ...td, color: cpa <= 43.13 ? C.green : cpa <= 50.74 ? C.yellow : C.red }}>{cpa > 0 ? fmt$(cpa) : '--'}</td>
                      <td style={{ ...td, color: freq > 5 ? C.red : freq > 3.5 ? C.yellow : C.text }}>{freq > 0 ? freq.toFixed(1) : '--'}</td>
                      <td style={td}>{c.health?.score || '--'}</td>
                      <td style={td}><span style={badge(statusColor[c.health?.status] || C.muted)}>{c.health?.status || '?'}</span></td>
                      <td style={td}>{actionCount > 0 ? <span style={badge(C.pink)}>{actionCount} actions</span> : <span style={{ color: C.muted, fontSize: 11 }}>Hold</span>}</td>
                    </tr>
                    {isExpanded && (c.surgicalActions || []).length > 0 && (
                      <tr key={`camp-${i}-actions`} onClick={e => e.stopPropagation()}>
                        <td colSpan={10} style={{ padding: 0, background: '#1C2333' }}>
                          <div style={{ padding: '8px 16px 12px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Surgical Actions</div>
                            {(c.surgicalActions || []).map((sa, j) => {
                              const saKey = `sa-${i}-${j}`
                              return (
                                <div key={j} style={{ ...card, borderLeft: `3px solid ${ACTION_COLORS[sa.action] || C.muted}`, marginBottom: 6, padding: '8px 12px' }}>
                                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: isMobile ? 8 : 0 }}>
                                    <div>
                                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                                        <span style={badge(PRIORITY_COLORS[sa.priority] || C.muted)}>{sa.priority}</span>
                                        <span style={badge(ACTION_COLORS[sa.action] || C.muted)}>{sa.action.replace(/_/g, ' ')}</span>
                                        <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{sa.entityName}</span>
                                      </div>
                                      <p style={{ color: C.muted, fontSize: 12, margin: '2px 0 0' }}>{sa.reason}</p>
                                      {sa.impact && <p style={{ color: C.green, fontSize: 12, margin: '2px 0 0' }}>{sa.impact}</p>}
                                      {sa.revenueProjection && (
                                        <div style={{ background: C.bg, borderRadius: 4, padding: '6px 8px', marginTop: 4, fontSize: 12 }}>
                                          <span style={{ color: C.muted }}>Current: {fmt$(sa.revenueProjection.currentBudget)}/day</span>
                                          <span style={{ color: C.text }}> {'\u2192'} New: {fmt$(sa.revenueProjection.newBudget)}/day</span>
                                          <br/>
                                          <span style={{ color: C.green }}>Expected: +{fmt$(sa.revenueProjection.expectedRevenuePerDay)} revenue/day, +{fmt$(sa.revenueProjection.expectedProfitPerDay)} profit/day</span>
                                          <span style={{ color: C.muted }}> (based on {sa.revenueProjection.basedOnRoas}x ROAS)</span>
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'flex-start' }} onClick={e => e.stopPropagation()}>
                                      {sa.action === 'SCALE_BUDGET' && sa.execute && (
                                        <ScaleButton entityId={sa.execute.params.adSetId} entityName={sa.entityName} currentBudget={sa.revenueProjection?.currentBudget} roas={sa.revenueProjection?.basedOnRoas} onScale={executeScale} scaling={scaling} isMobile={isMobile} />
                                      )}
                                      {sa.action === 'PAUSE' && (
                                        <div style={{ textAlign: 'right', display: 'flex', gap: 3, alignItems: 'flex-start' }}>
                                          <button
                                            onClick={e => { e.stopPropagation(); executeAction2('updateAdSetStatus', { adSetId: sa.entityId, status: 'PAUSED' }, saKey) }}
                                            disabled={actionLoading[saKey]}
                                            style={{ ...btnStyle(C.red), minHeight: isMobile ? 44 : 'auto' }}
                                          >{actionLoading[saKey] ? '...' : 'Pause'}</button>
                                          <button
                                            onClick={e => { e.stopPropagation(); doDuplicateAdSet(sa.entityId, sa.entityName) }}
                                            disabled={actionLoading[`dup-as-${sa.entityId}`]}
                                            style={{ ...btnStyle(C.blue), minHeight: isMobile ? 44 : 'auto' }}
                                          >{actionLoading[`dup-as-${sa.entityId}`] ? '...' : 'Duplicate'}</button>
                                        </div>
                                      )}
                                      {sa.action === 'REDUCE_BUDGET' && (
                                        <div style={{ textAlign: 'right' }}>
                                          <button
                                            onClick={e => { e.stopPropagation(); executeAction2('updateAdSetStatus', { adSetId: sa.entityId, status: 'PAUSED' }, saKey) }}
                                            disabled={actionLoading[saKey]}
                                            style={{ ...btnStyle(C.red), minHeight: isMobile ? 44 : 'auto' }}
                                          >{actionLoading[saKey] ? '...' : 'Pause'}</button>
                                          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Stops bleeding. Saves {sa.impact}</div>
                                        </div>
                                      )}
                                      {sa.action === 'REFRESH_AUDIENCE' && (
                                        <div style={{ textAlign: 'right' }}>
                                          <button
                                            onClick={e => { e.stopPropagation(); pauseAndReplace(sa.entityId, saKey) }}
                                            disabled={actionLoading[saKey]}
                                            style={{ ...btnStyle(C.yellow), minHeight: isMobile ? 44 : 'auto' }}
                                          >{actionLoading[saKey] ? '...' : 'Pause + Replace'}</button>
                                          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Pauses ad set + creates 3 fresh retargeting audiences on Meta</div>
                                        </div>
                                      )}
                                      {sa.action === 'REPLACE_CREATIVE' && (
                                        <div style={{ textAlign: 'right' }}>
                                          <button
                                            onClick={e => { e.stopPropagation(); executeAction2('updateAdStatus', { adId: sa.entityId, status: 'PAUSED' }, saKey) }}
                                            disabled={actionLoading[saKey]}
                                            style={{ ...btnStyle(C.pink), minHeight: isMobile ? 44 : 'auto' }}
                                          >{actionLoading[saKey] ? '...' : 'Pause Creative'}</button>
                                          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Creative is dead. Launch replacement.</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4b. Impact Tracker (recently activated ads) ───────────────────── */}
      {(d?.activations || []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={secTitle}>Ad Impact Tracker</h2>
          <div style={{ ...card, overflowX: 'auto' }}>
            <table style={tbl}>
              <thead><tr>
                <th style={th}>Ad</th><th style={th}>Ad Set</th><th style={th}>Activated</th>
                <th style={th}>Baseline CPA</th><th style={th}>3d</th><th style={th}>5d</th><th style={th}>7d</th><th style={th}>Verdict</th>
              </tr></thead>
              <tbody>
                {(d.activations || []).map((a, i) => {
                  const impactCell = (window) => {
                    const imp = a.impact?.[window]
                    if (!imp) return <td style={{ ...td, color: C.muted }}>Pending</td>
                    const dir = imp.delta?.cpaDirection
                    const color = dir === 'improved' ? C.green : dir === 'degraded' ? C.red : C.yellow
                    return (
                      <td style={{ ...td, color }}>
                        {fmt$(imp.cpa)}
                        <div style={{ fontSize: 10, color }}>{dir === 'improved' ? '\u2193' : dir === 'degraded' ? '\u2191' : '\u2192'} {fmt$(Math.abs(imp.delta?.cpa || 0))}</div>
                      </td>
                    )
                  }
                  const hasAll = a.impact?.['3d'] && a.impact?.['5d'] && a.impact?.['7d']
                  const verdict7d = a.impact?.['7d']?.delta?.cpaDirection
                  return (
                    <tr key={i}>
                      <td style={{ ...td, fontWeight: 600 }}>{a.adName}</td>
                      <td style={td}>{a.adSetName}</td>
                      <td style={td}>{a.activatedAt ? new Date(a.activatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '--'}</td>
                      <td style={td}>{fmt$(a.baseline?.cpa)}</td>
                      {impactCell('3d')}
                      {impactCell('5d')}
                      {impactCell('7d')}
                      <td style={td}>
                        {hasAll ? (
                          <span style={badge(verdict7d === 'improved' ? C.green : verdict7d === 'degraded' ? C.red : C.yellow)}>
                            {verdict7d === 'improved' ? 'WIN' : verdict7d === 'degraded' ? 'LOSS' : 'NEUTRAL'}
                          </span>
                        ) : (
                          <span style={badge(C.muted)}>TRACKING</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4c. Decision History (full audit trail) ───────────────────────── */}
      {decisionHistory.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ ...secTitle, margin: 0 }}>Decision History <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>({decisionHistory.length})</span></h2>
            <button onClick={loadDecisionHistory} style={btnStyle(C.muted)}>Refresh</button>
          </div>
          <div style={{ ...card, overflowX: 'auto' }}>
            <table style={tbl}>
              <thead><tr>
                <th style={th}></th><th style={th}>Ad</th><th style={th}>Campaign → Adset</th>
                <th style={th}>Date</th><th style={th}>Baseline CPA</th><th style={th}>7d CPA</th>
                <th style={th}>Delta</th><th style={th}>Verdict</th><th style={th}>Reason</th>
              </tr></thead>
              <tbody>
                {decisionHistory.map((dec, i) => {
                  const impact7d = dec.impact?.['7d']
                  const cpaDelta = impact7d?.delta?.cpa
                  const verdictColors = { winner: C.green, underperformer: C.red, neutral: C.yellow, tracking: C.muted }
                  const verdictLabels = { winner: 'WINNER', underperformer: 'UNDERPERFORMER', neutral: 'NEUTRAL', tracking: 'TRACKING' }
                  const isExpanded = expandedDecision === dec.id
                  return (
                    <>
                      <tr key={dec.id} onClick={() => setExpandedDecision(isExpanded ? null : dec.id)} style={{ cursor: 'pointer', background: isExpanded ? '#1C2333' : 'transparent' }}>
                        <td style={td}><span style={{ color: C.muted }}>{isExpanded ? '\u25BC' : '\u25B6'}</span></td>
                        <td style={{ ...td, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {dec.verdict === 'winner' && <span style={{ marginRight: 4 }}>{'\uD83C\uDFC6'}</span>}
                          {dec.adName}
                        </td>
                        <td style={{ ...td, fontSize: 11 }}>
                          {dec.campaignName && <span style={badge(C.blue)}>{dec.campaignName.slice(0, 20)}</span>}
                          {dec.adSetName && <span style={{ ...badge(C.purple), marginLeft: 4 }}>{dec.adSetName.slice(0, 20)}</span>}
                        </td>
                        <td style={td}>{dec.activatedAt ? new Date(dec.activatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '--'}</td>
                        <td style={td}>{fmt$(dec.baseline?.cpa)}</td>
                        <td style={{ ...td, color: impact7d ? (impact7d.cpa <= 25 ? C.green : impact7d.cpa <= 50 ? C.yellow : C.red) : C.muted }}>
                          {impact7d ? fmt$(impact7d.cpa) : 'Pending'}
                        </td>
                        <td style={{ ...td, color: cpaDelta != null ? (cpaDelta < 0 ? C.green : cpaDelta > 0 ? C.red : C.muted) : C.muted }}>
                          {cpaDelta != null ? `${cpaDelta > 0 ? '+' : ''}${fmt$(cpaDelta)}` : '--'}
                        </td>
                        <td style={td}>
                          <span style={badge(verdictColors[dec.verdict] || C.muted)}>
                            {verdictLabels[dec.verdict] || dec.verdict || 'TRACKING'}
                          </span>
                        </td>
                        <td style={{ ...td, fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.muted }}>
                          {dec.winnerReason || '--'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${dec.id}-detail`}>
                          <td colSpan={9} style={{ padding: 0, background: '#1C2333' }}>
                            <div style={{ padding: '10px 16px' }}>
                              {/* Impact windows */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                                {['3d', '5d', '7d'].map(w => {
                                  const imp = dec.impact?.[w]
                                  return (
                                    <div key={w} style={{ background: C.bg, borderRadius: 6, padding: 8 }}>
                                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{w.toUpperCase()} Impact</div>
                                      {imp ? (
                                        <>
                                          <div style={{ fontSize: 14, fontWeight: 700, color: imp.delta?.cpaDirection === 'improved' ? C.green : imp.delta?.cpaDirection === 'degraded' ? C.red : C.text }}>
                                            CPA: {fmt$(imp.cpa)} ({imp.delta?.cpaDirection || '?'})
                                          </div>
                                          <div style={{ fontSize: 11, color: C.muted }}>ROAS: {imp.roas?.toFixed(2)}x · Freq: {imp.frequency?.toFixed(1)}</div>
                                        </>
                                      ) : <div style={{ color: C.muted, fontSize: 12 }}>Pending</div>}
                                    </div>
                                  )
                                })}
                              </div>
                              {/* Copy used */}
                              {dec.copyPreview?.primaryText && (
                                <div style={{ background: C.bg, borderRadius: 6, padding: 8, marginBottom: 8 }}>
                                  <div style={{ fontSize: 10, color: C.muted }}>Copy Used</div>
                                  <div style={{ fontSize: 12, color: C.text }}>{dec.copyPreview.primaryText}</div>
                                  <div style={{ fontSize: 11, color: C.muted }}>{dec.copyPreview.headline} · {dec.copyPreview.description}</div>
                                </div>
                              )}
                              {/* Winner reason */}
                              {dec.winnerReason && (
                                <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: 6, padding: 8, marginBottom: 8 }}>
                                  <div style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>WHY IT WON</div>
                                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{dec.winnerReason}</div>
                                </div>
                              )}
                              {/* Replacement chain */}
                              {dec.chain && dec.chain.length > 0 && (
                                <div style={{ background: C.bg, borderRadius: 6, padding: 8 }}>
                                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>REPLACEMENT CHAIN</div>
                                  {dec.chain.map((link, j) => (
                                    <div key={j} style={{ fontSize: 11, color: C.text, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                                      <span style={{ color: C.muted }}>{new Date(link.activatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                                      <span>{link.adName}</span>
                                      <span style={badge(verdictColors[link.verdict] || C.muted)}>{link.verdict || '?'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 5. Creative Table with Recommendations ─────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ ...secTitle, margin: 0 }}>Creative Performance</h2>
          <button onClick={() => setShowCopyGen(!showCopyGen)} style={btnStyle(C.pink)}>
            {showCopyGen ? 'Close' : '+ New Creative'}
          </button>
        </div>

        {/* Copy Gen Panel (inline, toggleable) */}
        {showCopyGen && (
          <div style={{ ...card, marginBottom: 10, borderLeft: `3px solid ${C.pink}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.pink, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              AI Copy Generator
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexDirection: isMobile ? 'column' : 'row' }}>
              <input type="text" value={copyAngle} onChange={e => setCopyAngle(e.target.value)} placeholder="Angle / Hook (e.g. 'Works every time', 'Safe for mum & bub')"
                style={{ flex: 2, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, minHeight: isMobile ? 44 : 'auto' }} />
              <select value={copyProduct} onChange={e => setCopyProduct(e.target.value)}
                style={{ flex: 1, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, minHeight: isMobile ? 44 : 'auto' }}>
                <option value="">Any product</option>
                <option value="Confetti Cannons">Confetti Cannons</option>
                <option value="Powder Cannons">Powder Cannons</option>
                <option value="Bio Cannons">Bio Cannons</option>
                <option value="Smoke Bombs">Smoke Bombs</option>
                <option value="Extinguishers">Extinguishers</option>
                <option value="Sports Balls">Sports Balls</option>
                <option value="Mega Blaster">Mega Blaster</option>
                <option value="Mini Blaster">Mini Blaster</option>
                <option value="TNT Rental">TNT Rental (Hire)</option>
                <option value="Bundles">Bundles</option>
              </select>
              <button onClick={generateCopy} disabled={copyLoading || !copyAngle} style={{ ...btnStyle(C.pink), minHeight: isMobile ? 44 : 'auto' }}>
                {copyLoading ? 'Generating...' : 'Generate 3 Variants'}
              </button>
            </div>
            {copyVariants.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 8 }}>
                {copyVariants.map((v, i) => (
                  <div key={i} style={{ background: C.bg, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, color: C.pink, fontWeight: 700, marginBottom: 4 }}>VARIANT {i + 1}</div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4, marginBottom: 6 }}>{v.primaryText}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 2 }}>{v.headline}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{v.description}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <button onClick={() => navigator.clipboard.writeText(`${v.primaryText}\n\n${v.headline}\n${v.description}`)} style={{ ...btnSm, cursor: 'pointer' }}>Copy</button>
                      <button onClick={() => {
                        const adsets = d?.campaigns?.flatMap(c => (c.adSets || c.adsets || []).map(as => ({ ...as, campaignId: c.id, campaignName: c.name }))) || []
                        if (adsets.length > 0) {
                          createAdFromCopy(adsets[0].id || adsets[0].metaAdSetId, copyAngle, copyProduct)
                        }
                      }} disabled={actionLoading['create-ad-copy']} style={{ ...btnStyle(C.green), fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}>
                        {actionLoading['create-ad-copy'] ? '...' : 'Create Ad'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={tbl}>
            <thead><tr>
              <th style={th}>Creative</th><th style={th}>Angle</th><th style={th}>ROAS</th>
              <th style={th}>CPA</th><th style={th}>Spend</th><th style={th}>Purchases</th>
              <th style={th}>Freq</th><th style={th}>Fatigue</th><th style={th}>Recommendation</th><th style={th}>Actions</th>
            </tr></thead>
            <tbody>
              {(d?.creatives || []).length === 0 && (
                <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: C.muted }}>No creative data. Click Sync Meta.</td></tr>
              )}
              {(d?.creatives || []).map((cr, i) => {
                const recColor = REC_COLORS[cr.recommendation] || C.muted
                const rowBg = cr.recommendation === 'SCALE' ? '#3FB95008' : cr.recommendation === 'KILL' ? '#F8514908' : 'transparent'
                // Use metaAdId falling back to adId for the ad identifier
                const creativeAdId = cr.metaAdId || cr.adId
                // For scaling, we need an ad SET id. Use adsetId or metaAdSetId; fall back to ad id only as last resort
                const creativeAdSetId = cr.adsetId || cr.metaAdSetId || cr.adSetId
                const crActionKey = `cr-${i}`
                return (
                  <tr key={i} style={{ background: rowBg }}>
                    <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: cr.cpa7d > 0 && cr.cpa7d <= 25 && cr.purchases >= 3 ? `${C.green}08` : 'transparent' }} title={cr.name}>
                      {cr.cpa7d > 0 && cr.cpa7d <= 25 && cr.purchases >= 3 && <span style={{ marginRight: 4 }}>{'\uD83C\uDFC6'}</span>}
                      {cr.name}
                    </td>
                    <td style={td}><span style={badge(C.purple)}>{cr.creativeAngle}</span></td>
                    <td style={{ ...td, fontWeight: 600, color: cr.roas7d >= 2.22 ? C.green : cr.roas7d > 0 ? C.red : C.muted }}>{cr.roas7d > 0 ? fmtX(cr.roas7d) : '--'}</td>
                    <td style={{ ...td, color: cr.cpa7d > 0 && cr.cpa7d <= 43.13 ? C.green : cr.cpa7d > 50.74 ? C.red : C.text }}>{cr.cpa7d > 0 ? fmt$(cr.cpa7d) : '--'}</td>
                    <td style={td}>{fmt$(cr.spend)}</td>
                    <td style={td}>{cr.purchases}</td>
                    <td style={{ ...td, color: cr.frequency > 5 ? C.red : cr.frequency > 3.5 ? C.yellow : C.text }}>
                      {cr.frequency}
                      {cr.frequencyTrend && (
                        <div style={{ fontSize: 9, color: cr.frequencyTrend.trend === 'rising' ? C.red : cr.frequencyTrend.trend === 'falling' ? C.green : C.muted }}>
                          {cr.frequencyTrend.trend === 'rising' ? '\u2191' : cr.frequencyTrend.trend === 'falling' ? '\u2193' : '\u2192'} {Math.abs(cr.frequencyTrend.velocity)}%
                          {cr.frequencyTrend.alert && <span style={{ color: C.red, fontWeight: 700, marginLeft: 3 }}>SPIKING</span>}
                        </div>
                      )}
                    </td>
                    <td style={td}><FatigueBar score={cr.fatigueScore} status={cr.fatigueStatus} /></td>
                    <td style={td}>
                      <span style={recBadge(recColor)}>{cr.recommendation}</span>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2, maxWidth: 180 }}>{cr.recommendationReason}</div>
                      {cr.revenueProjection && (
                        <div style={{ fontSize: 10, color: C.green, marginTop: 2 }}>
                          +{fmt$(cr.revenueProjection.expectedRevenuePerDay)}/day rev, +{fmt$(cr.revenueProjection.expectedProfitPerDay)}/day profit
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {scaleTarget?.id === (creativeAdSetId || creativeAdId) ? (
                        <ScaleInline target={scaleTarget} onScale={executeScale} onCancel={() => setScaleTarget(null)} scaling={scaling} isMobile={isMobile} />
                      ) : (
                        <div style={{ display: 'flex', gap: 3 }}>
                          {(cr.recommendation === 'SCALE' || cr.recommendation === 'PROTECT') && creativeAdSetId && (
                            <button
                              onClick={e => { e.stopPropagation(); setScaleTarget({ id: creativeAdSetId, name: cr.name, budget: cr.spend / 7, roas: cr.roas7d }) }}
                              style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}
                            >Scale</button>
                          )}
                          {(cr.recommendation === 'SCALE' || cr.recommendation === 'PROTECT') && !creativeAdSetId && (
                            <span style={{ color: C.muted, fontSize: 10 }}>No ad set ID</span>
                          )}
                          {cr.recommendation === 'KILL' && (
                            <button
                              onClick={e => { e.stopPropagation(); executeAction2('updateAdStatus', { adId: creativeAdId, status: 'PAUSED' }, `kill-${crActionKey}`) }}
                              disabled={actionLoading[`kill-${crActionKey}`]}
                              style={{ ...btnStyle(C.red), minHeight: isMobile ? 44 : 'auto' }}
                            >{actionLoading[`kill-${crActionKey}`] ? '...' : 'Pause'}</button>
                          )}
                          {cr.recommendation === 'REPLACE' && (
                            <button
                              onClick={e => { e.stopPropagation(); executeAction2('updateAdStatus', { adId: creativeAdId, status: 'PAUSED' }, `replace-${crActionKey}`) }}
                              disabled={actionLoading[`replace-${crActionKey}`]}
                              style={{ ...btnStyle(C.pink), minHeight: isMobile ? 44 : 'auto' }}
                            >{actionLoading[`replace-${crActionKey}`] ? '...' : 'Pause'}</button>
                          )}
                          <button onClick={e => { e.stopPropagation(); analyseCreative(cr.name) }} style={{ ...btnStyle(C.purple), minHeight: isMobile ? 44 : 'auto' }}>AI</button>
                          {creativeAdId && (
                            <button
                              onClick={e => { e.stopPropagation(); doDuplicateAd(creativeAdId, cr.name) }}
                              disabled={actionLoading[`dup-${creativeAdId}`]}
                              style={{ ...btnStyle(C.blue), minHeight: isMobile ? 44 : 'auto' }}
                            >{actionLoading[`dup-${creativeAdId}`] ? '...' : 'Dup'}</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 6. Growth Opportunities (always visible) ───────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>Growth Opportunities</h2>
        {(d?.opportunities || []).length === 0 ? (
          <div style={{ ...card, borderLeft: `3px solid ${C.green}` }}>
            <span style={{ color: C.green, fontWeight: 600 }}>All clear</span>
            <span style={{ color: C.muted, marginLeft: 8, fontSize: 12 }}>No gaps detected in current setup</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
            {(d?.opportunities || []).map((o, i) => (
              <div key={i} style={{ ...card, borderLeft: `3px solid ${o.priority === 'high' ? C.pink : C.blue}` }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={badge(o.priority === 'high' ? C.pink : C.blue)}>{o.priority}</span>
                  <span style={badge(C.purple)}>{o.type.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, color: C.text }}>{o.title}</div>
                <p style={{ color: C.muted, fontSize: 12, margin: 0, lineHeight: 1.4 }}>{o.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 6b. Audience Manager ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 8 : 0, marginBottom: 8 }}>
          <h2 style={secTitle}>Audience Engine</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={evaluateAudiences} disabled={actionLoading.evalAudiences} style={{ ...btnStyle(C.blue), minHeight: isMobile ? 44 : 'auto' }}>{actionLoading.evalAudiences ? 'Evaluating...' : 'Evaluate All'}</button>
            <button onClick={loadAudiences} style={{ ...btnStyle(C.muted), minHeight: isMobile ? 44 : 'auto' }}>Refresh</button>
          </div>
        </div>

        {/* Stats row */}
        {audiences?.learnings && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)', gap: 8, marginBottom: 10 }}>
            <div style={card}><div style={{ fontSize: 10, color: C.muted }}>Testing</div><div style={{ fontSize: 20, fontWeight: 700, color: C.blue }}>{audiences.learnings.testing}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: C.muted }}>Winners</div><div style={{ fontSize: 20, fontWeight: 700, color: C.green }}>{audiences.learnings.scaled}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: C.muted }}>Killed</div><div style={{ fontSize: 20, fontWeight: 700, color: C.red }}>{audiences.learnings.killed}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: C.muted }}>Win Rate</div><div style={{ fontSize: 20, fontWeight: 700, color: audiences.learnings.winRate >= 30 ? C.green : C.yellow }}>{audiences.learnings.winRate}%</div></div>
            <div style={card}><div style={{ fontSize: 10, color: C.muted }}>Total Created</div><div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{audiences.learnings.total}</div></div>
          </div>
        )}

        {/* Audience templates by tier */}
        {['retargeting', 'lookalike', 'interest', 'geo'].map(tier => {
          const tierTemplates = (audiences?.templates || []).filter(t => t.type === tier)
          if (tierTemplates.length === 0) return null
          const tierLabels = { retargeting: 'Retargeting (Highest ROAS)', lookalike: 'Lookalikes (Scale Fuel)', interest: 'Interest Targeting (Cold)', geo: 'Geo Targeting (State-Level)' }
          const tierColors = { retargeting: C.green, lookalike: C.blue, interest: C.purple, geo: C.orange }
          const isCreatableTier = tier === 'retargeting' || tier === 'lookalike'
          return (
            <div key={tier} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: tierColors[tier], marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tierLabels[tier]}</div>
              <div style={{ ...card, overflowX: 'auto' }}>
                <table style={tbl}>
                  <thead><tr>
                    <th style={th}>Audience</th><th style={th}>Expected ROAS</th><th style={th}>Expected CPA</th>
                    <th style={th}>Status</th><th style={th}>Days</th><th style={th}>Performance</th><th style={th}>Action</th>
                  </tr></thead>
                  <tbody>
                    {tierTemplates.map((t, i) => {
                      const statusColors = { not_created: C.muted, created: C.blue, testing: C.yellow, scaled: C.green, killed: C.red, seed: C.muted }
                      const isConfigExpanded = expandedTemplate === t.id
                      return (
                        <>
                          <tr key={`aud-${tier}-${i}`}>
                            <td style={td}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                              <div style={{ fontSize: 10, color: C.muted, maxWidth: 250 }}>{t.reason}</div>
                            </td>
                            <td style={{ ...td, color: C.green, fontWeight: 600 }}>{t.expectedRoas ? fmtX(t.expectedRoas) : '--'}</td>
                            <td style={{ ...td, color: C.text }}>{t.expectedCpa ? fmt$(t.expectedCpa) : '--'}</td>
                            <td style={td}><span style={badge(statusColors[t.status] || C.muted)}>{t.status.replace(/_/g, ' ')}</span></td>
                            <td style={td}>{t.daysInTest > 0 ? `${t.daysInTest}d` : '--'}</td>
                            <td style={td}>
                              {t.performance ? (
                                <div style={{ fontSize: 11 }}>
                                  <span style={{ color: t.performance.roas >= 2.22 ? C.green : C.red }}>{fmtX(t.performance.roas)}</span>
                                  <span style={{ color: C.muted }}> | CPA </span>
                                  <span style={{ color: t.performance.cpa <= 38 ? C.green : C.red }}>{fmt$(t.performance.cpa)}</span>
                                  <span style={{ color: C.muted }}> | {t.performance.totalPurchases}p</span>
                                </div>
                              ) : <span style={{ color: C.muted, fontSize: 11 }}>--</span>}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {t.status === 'not_created' && isCreatableTier && (
                                <button
                                  onClick={e => { e.stopPropagation(); createAudienceFromTemplate(t.id) }}
                                  disabled={creatingAudience[t.id]}
                                  style={{ ...btnStyle(tierColors[tier]), minHeight: isMobile ? 44 : 'auto' }}
                                >{creatingAudience[t.id] ? 'Creating...' : 'Create + Launch Test'}</button>
                              )}
                              {t.status === 'not_created' && !isCreatableTier && (
                                <button
                                  onClick={e => { e.stopPropagation(); setExpandedTemplate(isConfigExpanded ? null : t.id) }}
                                  style={{ ...btnStyle(tierColors[tier]), minHeight: isMobile ? 44 : 'auto' }}
                                >{isConfigExpanded ? 'Hide Config' : 'View Config'}</button>
                              )}
                              {t.status === 'testing' && t.daysInTest >= 3 && (
                                <div style={{ display: 'flex', gap: 3 }}>
                                  {t.performance?.cpa > 0 && t.performance.cpa <= GRI_ADS_FE.profitableCPP && t.performance.totalPurchases >= 3 && (
                                    <button
                                      onClick={e => { e.stopPropagation(); scaleAudienceAction(t.id) }}
                                      disabled={actionLoading[`scale-aud-${t.id}`]}
                                      style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}
                                    >{actionLoading[`scale-aud-${t.id}`] ? '...' : 'Scale'}</button>
                                  )}
                                  {(t.performance?.totalSpend > 100 && t.performance?.totalPurchases === 0) || (t.performance?.cpa > GRI_ADS_FE.breakevenCPP * 2) ? (
                                    <button
                                      onClick={e => { e.stopPropagation(); killAudienceAction(t.id) }}
                                      disabled={actionLoading[`kill-aud-${t.id}`]}
                                      style={{ ...btnStyle(C.red), minHeight: isMobile ? 44 : 'auto' }}
                                    >{actionLoading[`kill-aud-${t.id}`] ? '...' : 'Kill'}</button>
                                  ) : null}
                                </div>
                              )}
                              {t.status === 'created' && (
                                <button
                                  onClick={e => { e.stopPropagation(); previewAudienceLaunch(t) }}
                                  style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}
                                >Launch Test</button>
                              )}
                              {t.status === 'scaled' && <span style={badge(C.green)}>Winner</span>}
                              {t.status === 'killed' && <span style={badge(C.red)}>Dead</span>}
                            </td>
                          </tr>
                          {isConfigExpanded && (
                            <tr key={`aud-config-${tier}-${i}`}>
                              <td colSpan={7} style={{ padding: 0, background: '#1C2333' }}>
                                <div style={{ padding: '10px 16px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Targeting Configuration</div>
                                  <div style={{ background: C.bg, borderRadius: 6, padding: '8px 12px', fontSize: 12, color: C.text }}>
                                    <div><span style={{ color: C.muted }}>Type:</span> {tier === 'interest' ? 'Interest Targeting' : 'Geo Targeting'}</div>
                                    <div><span style={{ color: C.muted }}>Name:</span> {t.name}</div>
                                    {t.interests && <div><span style={{ color: C.muted }}>Interests:</span> {Array.isArray(t.interests) ? t.interests.join(', ') : t.interests}</div>}
                                    {t.geos && <div><span style={{ color: C.muted }}>Geos:</span> {Array.isArray(t.geos) ? t.geos.join(', ') : t.geos}</div>}
                                    {t.targeting && <div><span style={{ color: C.muted }}>Targeting:</span> <pre style={{ margin: '4px 0 0', fontSize: 11, color: C.text, whiteSpace: 'pre-wrap' }}>{JSON.stringify(t.targeting, null, 2)}</pre></div>}
                                    {t.ageRange && <div><span style={{ color: C.muted }}>Age:</span> {t.ageRange}</div>}
                                    {t.gender && <div><span style={{ color: C.muted }}>Gender:</span> {t.gender}</div>}
                                    <div style={{ marginTop: 4, fontSize: 11, color: C.muted }}>This is a targeting configuration template. Apply these settings manually when creating ad sets in Meta Ads Manager.</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 7. Creative Analysis ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>Creative Analysis</h2>
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexDirection: isMobile ? 'column' : 'row' }}>
            <input type="text" value={analyseAdName} onChange={e => setAnalyseAdName(e.target.value)} placeholder="Paste ad name or describe the creative..."
              style={{ flex: 1, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, minHeight: isMobile ? 44 : 'auto' }} />
            <button onClick={() => analyseCreative(analyseAdName)} disabled={analysing || !analyseAdName} style={{ ...btnStyle(C.purple), minHeight: isMobile ? 44 : 'auto' }}>
              {analysing ? 'Analysing...' : 'Analyse'}
            </button>
          </div>
          <p style={{ color: C.muted, fontSize: 11, margin: 0 }}>AI detects angle, recommends placement, writes copy, suggests campaign and ad set.</p>
          {analysis && !analysis.error && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                <div><div style={{ fontSize: 10, color: C.muted }}>Angle</div><span style={badge(C.purple)}>{analysis.detectedAngle}</span></div>
                <div><div style={{ fontSize: 10, color: C.muted }}>Format</div><span style={badge(C.blue)}>{analysis.detectedFormat}</span></div>
                <div><div style={{ fontSize: 10, color: C.muted }}>AOV Potential</div><span style={badge(analysis.aovPotential === 'premium' ? C.green : C.yellow)}>{analysis.aovPotential}</span></div>
                <div><div style={{ fontSize: 10, color: C.muted }}>Spend</div><span style={{ color: C.green, fontWeight: 600 }}>${analysis.recommendedDailySpend}/day</span></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div><div style={{ fontSize: 10, color: C.muted }}>Campaign</div><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{analysis.recommendedCampaign}</div></div>
                <div><div style={{ fontSize: 10, color: C.muted }}>Audience</div><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{analysis.recommendedAudience}</div></div>
              </div>
              {analysis.suggestedHookLine && <div style={{ background: C.bg, borderRadius: 6, padding: 8, marginBottom: 6 }}><div style={{ fontSize: 10, color: C.muted }}>Hook</div><div style={{ fontSize: 14, fontWeight: 600, color: C.pink }}>{analysis.suggestedHookLine}</div></div>}
              {analysis.suggestedBodyCopy && <div style={{ background: C.bg, borderRadius: 6, padding: 8, marginBottom: 6 }}><div style={{ fontSize: 10, color: C.muted }}>Body Copy</div><div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: C.text }}>{analysis.suggestedBodyCopy}</div></div>}
              <p style={{ color: C.muted, fontSize: 12, margin: '4px 0 0' }}>{analysis.placementReasoning}</p>
            </div>
          )}
          {analysis?.error && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>Error: {analysis.error}</div>}
        </div>
      </div>

      {/* ── 8. AOV Intelligence ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>AOV Intelligence</h2>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 10 }}>
          <div style={card}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: C.text }}>Daily AOV vs $160 Target</h3>
            {d?.aov?.dailyAvgAov?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={d.aov.dailyAvgAov}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} tickFormatter={dt => dt.slice(5)} />
                  <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 11 }} />
                  <ReferenceLine y={160} stroke={C.green} strokeDasharray="5 5" />
                  <Bar dataKey="avgAov" fill={C.blue} name="Avg AOV" radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <p style={{ color: C.muted, fontSize: 12 }}>Waiting for order data via Shopify webhook</p>}
          </div>
          <div style={card}>
            <div style={{ fontSize: 24, fontWeight: 700, color: (d?.aov?.bundleRate || 0) >= 30 ? C.green : C.yellow }}>{fmtPct(d?.aov?.bundleRate)}</div>
            <p style={{ color: C.muted, fontSize: 11 }}>bundle rate (target: 30%)</p>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginTop: 8 }}>{fmtPct(d?.aov?.singleItemRate)}</div>
            <p style={{ color: C.muted, fontSize: 11 }}>single item orders</p>
            {(d?.aov?.topCombos || []).length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>Top combos</div>
                {d.aov.topCombos.map((tc, i) => <div key={i} style={{ fontSize: 10, color: C.muted }}>{tc.combo}: {tc.count} ({tc.pctOfOrders}%)</div>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 9. Weekly Rhythm ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[{ day: 'monday', label: 'Monday', task: 'Review + Kill Rules', d: 1 }, { day: 'wednesday', label: 'Wednesday', task: 'Creative Launch', d: 3 }, { day: 'friday', label: 'Friday', task: 'Brief Generation', d: 5 }].map(r => {
          const done = d?.rhythm?.[`${r.day}Done`]
          const isToday = dayOfWeek === r.d
          return (
            <div key={r.day} style={{ ...card, borderTop: `3px solid ${done ? C.green : isToday ? C.blue : C.border}`, opacity: isToday || done ? 1 : 0.5 }}>
              <div style={{ fontSize: 11, color: C.muted }}>{r.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.task}</div>
              {done ? <span style={badge(C.green)}>Done</span> : isToday ? <button onClick={() => markDay(r.day)} style={{ ...btnSm, cursor: 'pointer', minHeight: isMobile ? 44 : 'auto' }}>Mark Done</button> : null}
            </div>
          )
        })}
      </div>

      {/* ── 10. Creative Brief ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={secTitle}>Creative Brief</h2>
        <div style={card}>
          {d?.brief ? (
            <div>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: isMobile ? 8 : 0, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: C.text }}>Week of {d.brief.weekOf}</span>
                {d.brief.status === 'draft' && <button onClick={() => approveBrief(d.brief.id)} style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}>Approve Brief</button>}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, color: C.text, maxHeight: 300, overflow: 'auto' }}>{d.brief.fullBrief}</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <p style={{ color: C.muted, marginBottom: 8 }}>No brief generated yet</p>
              <button onClick={triggerBrief} disabled={generating} style={{ ...btnStyle(C.pink), minHeight: isMobile ? 44 : 'auto' }}>{generating ? 'Generating...' : 'Generate Brief'}</button>
            </div>
          )}
        </div>
      </div>

      {/* ── 11. System Health (compact footer) ─────────────────────────────── */}
      {d?.health && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: C.muted, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={badge(d.health.status === 'healthy' ? C.green : C.yellow)}>{d.health.status}</span>
          <span>Backup: {d.health.backups?.latest || 'none'} ({d.health.backups?.totalDays || 0} days)</span>
          {d.health.issues?.length > 0 && <span style={{ color: C.yellow }}>{d.health.issues.length} issues</span>}
        </div>
      )}

      {/* ── Resolve / Replace Creative Modal ─────────────────────────────── */}
      {resolveTarget && (
        <div onClick={() => setResolveTarget(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          overflowY: 'auto', padding: 20
        }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, maxWidth: 620, width: '100%', padding: 24, border: `2px solid ${C.pink}`, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              Pause & Replace Fatigued Creative
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
              This ad is exhausted. It will be paused → creative swapped → reactivated in one batch. No spend during the swap.
            </div>

            {/* Current ad preview — thumbnail + copy */}
            <div style={{ background: C.bg, borderRadius: 8, padding: 12, marginBottom: 16, borderLeft: `3px solid ${C.red}` }}>
              <div style={{ fontSize: 10, color: C.red, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>CURRENT AD (REPLACING THIS)</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {/* Thumbnail */}
                {(oldCreativeSpec?.thumbnailUrl || oldCreativeSpec?.imageUrl) ? (
                  <div style={{ flexShrink: 0, width: 120, height: 120, borderRadius: 8, overflow: 'hidden', background: C.card, border: `1px solid ${C.border}` }}>
                    <img
                      src={oldCreativeSpec.thumbnailUrl || oldCreativeSpec.imageUrl}
                      alt="Current ad"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  </div>
                ) : (
                  <div style={{ flexShrink: 0, width: 120, height: 120, borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: C.muted, fontSize: 10, textAlign: 'center' }}>
                      {oldCreativeSpec ? (oldCreativeSpec.isVideo ? 'Video ad\n(no thumbnail)' : 'No preview') : 'Loading...'}
                    </span>
                  </div>
                )}

                {/* Ad details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>{resolveTarget.entityName || resolveTarget.title}</div>
                  {/* Current copy from Meta */}
                  {oldCreativeSpec?.message && (
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4, marginBottom: 4, maxHeight: 48, overflow: 'hidden' }}>
                      "{oldCreativeSpec.message.slice(0, 120)}{oldCreativeSpec.message.length > 120 ? '...' : ''}"
                    </div>
                  )}
                  {oldCreativeSpec?.headline && (
                    <div style={{ fontSize: 11, color: C.muted }}>
                      Headline: <span style={{ color: C.text, fontWeight: 600 }}>{oldCreativeSpec.headline}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{resolveTarget.body || ''}</div>
                </div>
              </div>

              {/* Campaign + Adset context */}
              {(() => {
                let asName = '', cName = '', cObjective = ''
                for (const c of d?.campaigns || []) {
                  if (resolveTarget.campaignId && c.id === resolveTarget.campaignId) {
                    cName = c.name
                    cObjective = c.objective || ''
                    for (const as of c.adSets || c.adsets || []) {
                      if ((as.id || as.metaAdSetId) === resolveTarget.adSetId) { asName = as.name; break }
                    }
                    break
                  }
                }
                return (
                  <div style={{ marginTop: 8 }}>
                    {(cName || asName) && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        {cName && <span style={badge(C.blue)}>{cName}</span>}
                        {cObjective && <span style={badge(C.muted)}>{cObjective.replace('OUTCOME_', '')}</span>}
                        {asName && <span style={badge(C.purple)}>{asName}</span>}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Creative context — what type of ad is this */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                <div style={{ background: `${C.card}`, borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Audience</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                    {(resolveTarget.audience || 'unknown').replace(/_/g, ' ')}
                  </div>
                </div>
                <div style={{ background: `${C.card}`, borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Angle</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                    {resolveTarget.creativeAngle || 'unknown'}
                  </div>
                </div>
                <div style={{ background: `${C.card}`, borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Format</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                    {resolveTarget.formatType || 'unknown'}
                  </div>
                </div>
              </div>

              {/* Guidance: what type of creative to replace with */}
              <div style={{ marginTop: 8, background: `${C.yellow}12`, border: `1px solid ${C.yellow}33`, borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.yellow, marginBottom: 2 }}>REPLACEMENT GUIDE</div>
                <div style={{ fontSize: 11, color: C.text, lineHeight: 1.4 }}>
                  {resolveTarget.audience === 'retargeting_warm'
                    ? 'This is a retargeting ad — viewers already know GRI. Use trust/urgency creative (reviews, scarcity, "order before your reveal date").'
                    : resolveTarget.audience === 'lookalike'
                    ? 'This is a lookalike audience — similar to your buyers. Use your best-performing angle with a fresh visual. Same hook, new look.'
                    : 'This is a cold/broad audience — they\'ve never seen GRI. Lead with a strong hook, show the product in action, make the reveal moment the hero.'}
                  {resolveTarget.formatType === 'video' ? ' Keep it as video — swap the first 3 seconds (hook) for maximum impact.' : ''}
                  {resolveTarget.formatType === 'image' ? ' Consider testing a video version — video typically outperforms static for gender reveals.' : ''}
                </div>
              </div>
            </div>

            {/* Current creative info (fetched from Meta) */}
            {oldCreativeSpec && (
              <div style={{ background: C.bg, borderRadius: 8, padding: 12, marginBottom: 16, borderLeft: `3px solid ${C.blue}` }}>
                <div style={{ fontSize: 10, color: C.blue, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>CURRENT CREATIVE</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div style={{ background: C.card, borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Type</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: oldCreativeSpec.isVideo ? C.pink : C.blue }}>
                      {oldCreativeSpec.isVideo ? 'VIDEO' : 'IMAGE'}
                    </div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Format</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      {oldCreativeSpec.isVideo ? 'Upload .mp4 or .mov' : 'Upload .jpg or .png'}
                    </div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Media</div>
                    <div style={{ fontSize: 10, color: C.muted, wordBreak: 'break-all' }}>
                      {oldCreativeSpec.isVideo ? `Video ID: ${oldCreativeSpec.videoId || '--'}` : 'Image ad'}
                    </div>
                  </div>
                </div>
                {/* Show current copy for reference */}
                {oldCreativeSpec.message && (
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
                    <span style={{ color: C.text, fontWeight: 600 }}>Current copy:</span> "{oldCreativeSpec.message.slice(0, 100)}{oldCreativeSpec.message.length > 100 ? '...' : ''}"
                  </div>
                )}
                {/* Ratio warning */}
                <div style={{ marginTop: 6, fontSize: 10, color: C.yellow, fontWeight: 600 }}>
                  Upload the same ratio as the current ad. {oldCreativeSpec.isVideo
                    ? 'If the old video was 9:16 (Reels), upload 9:16. If 1:1 (Feed), upload 1:1.'
                    : 'If the old image was 1:1, upload 1:1. If 4:5, upload 4:5.'}
                </div>
              </div>
            )}

            {/* Step 1: Drag and drop creative */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.pink, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                STEP 1: NEW CREATIVE {oldCreativeSpec?.isVideo ? '(VIDEO)' : oldCreativeSpec?.isImage ? '(IMAGE)' : ''}
              </div>

              {uploadedFile ? (
                /* Upload complete — animated tick confirmation */
                <div style={{ background: `${C.green}18`, border: `2px solid ${C.green}`, borderRadius: 10, padding: 24, textAlign: 'center' }}>
                  <div className="fw-tick-circle" style={{
                    width: 56, height: 56, borderRadius: '50%', background: C.green,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px', boxShadow: `0 0 20px ${C.green}44`,
                  }}>
                    <span style={{ fontSize: 28, lineHeight: 1 }}>✓</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.green, marginBottom: 4 }}>
                    {uploadedFile.type === 'video' ? 'Video' : 'Image'} Uploaded ✅
                  </div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{uploadedFile.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    {uploadedFile.type === 'video' ? `Ready on Meta · Video ID: ${uploadedFile.videoId}` : 'Ready on Meta · Continue to Step 2'}
                  </div>
                  <button onClick={() => { setUploadedFile(null); setReplaceImageUrl(''); setUploadError(null) }} style={{ ...btnStyle(C.muted), marginTop: 12, fontSize: 10 }}>
                    Remove & upload different file
                  </button>
                </div>
              ) : uploadingCreative ? (
                /* Uploading — animated progress */
                <div style={{ background: C.bg, border: `2px solid ${C.blue}`, borderRadius: 10, padding: 24, textAlign: 'center' }}>
                  {/* Spinning loader */}
                  <div style={{
                    width: 44, height: 44, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.blue}`,
                    borderRadius: '50%', margin: '0 auto 12px',
                    animation: 'upload-spin 0.8s linear infinite',
                  }} />
                  <div style={{ fontSize: 15, color: C.blue, fontWeight: 700 }}>Uploading to Meta...</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Please wait, do not close this window</div>
                  {/* Progress bar animation */}
                  <div style={{ width: '80%', height: 4, background: C.border, borderRadius: 2, margin: '12px auto 0', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', background: C.blue, borderRadius: 2,
                      animation: 'upload-bar 2s ease-in-out infinite',
                    }} />
                  </div>
                  <style>{`
                    @keyframes upload-spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                    @keyframes upload-bar {
                      0% { width: 0%; }
                      50% { width: 70%; }
                      100% { width: 95%; }
                    }
                  `}</style>
                </div>
              ) : (
                /* Drag and drop zone */
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={async e => {
                    e.preventDefault()
                    setDragOver(false)
                    const file = e.dataTransfer.files[0]
                    if (!file) return
                    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                      setScaleResult({ ok: false, error: `Unsupported file: ${file.type}. Use jpg/png/mp4/mov.` })
                      return
                    }
                    setUploadingCreative(true)
                    setUploadError(null)
                    try {
                      const formData = new FormData()
                      formData.append('file', file)
                      const resp = await fetch(`${API}/upload-creative`, { method: 'POST', body: formData })
                      const result = await resp.json()
                      if (result.ok) {
                        setUploadedFile({ name: file.name, type: result.type, url: result.url, videoId: result.videoId })
                        setReplaceImageUrl(result.url || `meta-video:${result.videoId}`)
                        setUploadError(null)
                      } else {
                        setUploadError(result.error || 'Upload failed')
                      }
                    } catch (err) {
                      setUploadError(err.message || 'Upload failed — check your connection')
                    }
                    setUploadingCreative(false)
                  }}
                  style={{
                    background: dragOver ? `${C.pink}15` : C.bg,
                    border: `2px dashed ${dragOver ? C.pink : C.border}`,
                    borderRadius: 10, padding: 32, textAlign: 'center', cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'image/*,video/*'
                    input.onchange = async (e) => {
                      const file = e.target.files[0]
                      if (!file) return
                      setUploadingCreative(true)
                      setUploadError(null)
                      try {
                        const formData = new FormData()
                        formData.append('file', file)
                        const resp = await fetch(`${API}/upload-creative`, { method: 'POST', body: formData })
                        const result = await resp.json()
                        if (result.ok) {
                          setUploadedFile({ name: file.name, type: result.type, url: result.url, videoId: result.videoId })
                          setReplaceImageUrl(result.url || `meta-video:${result.videoId}`)
                          setUploadError(null)
                        } else {
                          setUploadError(result.error || 'Upload failed')
                        }
                      } catch (err) {
                        setUploadError(err.message || 'Upload failed')
                      }
                      setUploadingCreative(false)
                    }
                    input.click()
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>+</div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
                    Drag & drop your {oldCreativeSpec?.isVideo ? 'video' : 'image'} here
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    or click to browse · jpg, png, mp4, mov · uploads direct to Meta
                  </div>
                  {oldCreativeSpec && (
                    <div style={{ fontSize: 10, color: C.yellow, marginTop: 8 }}>
                      Match the original ratio: {oldCreativeSpec.isVideo ? '9:16 for Reels, 1:1 for Feed' : '1:1 or 4:5 to match existing'}
                    </div>
                  )}
                </div>
              )}
              {/* Upload error message */}
              {uploadError && (
                <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: '8px 12px', marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Upload failed</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{uploadError}</div>
                  <button onClick={() => setUploadError(null)} style={{ ...btnStyle(C.muted), marginTop: 6, fontSize: 10 }}>Dismiss</button>
                </div>
              )}
            </div>

            {/* Step 2: Generate new copy */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.pink, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                STEP 2: FRESH AD COPY
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexDirection: isMobile ? 'column' : 'row' }}>
                <input
                  type="text"
                  value={replaceCopyAngle}
                  onChange={e => setReplaceCopyAngle(e.target.value)}
                  placeholder="Angle / Hook (e.g. 'Works every time', 'Bold colour guaranteed')"
                  style={{ flex: 2, padding: '10px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }}
                />
                <select
                  value={replaceCopyProduct}
                  onChange={e => setReplaceCopyProduct(e.target.value)}
                  style={{ flex: 1, padding: '10px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }}
                >
                  <option value="">Any product</option>
                  <option value="Confetti Cannons">Confetti Cannons</option>
                  <option value="Powder Cannons">Powder Cannons</option>
                  <option value="Bio Cannons">Bio Cannons</option>
                  <option value="Smoke Bombs">Smoke Bombs</option>
                  <option value="Extinguishers">Extinguishers</option>
                  <option value="Sports Balls">Sports Balls</option>
                  <option value="Mega Blaster">Mega Blaster</option>
                </select>
                <button
                  onClick={generateReplacementCopy}
                  disabled={replaceCopyLoading || !replaceCopyAngle}
                  style={{ ...btnStyle(C.pink), minHeight: isMobile ? 44 : 'auto', whiteSpace: 'nowrap' }}
                >
                  {replaceCopyLoading ? 'Generating...' : 'Generate Copy'}
                </button>
              </div>

              {/* Copy variants */}
              {replaceCopyVariants.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {replaceCopyVariants.map((v, i) => {
                    const isSelected = replaceSelectedVariant === v
                    return (
                      <div
                        key={i}
                        onClick={() => setReplaceSelectedVariant(v)}
                        style={{
                          background: isSelected ? `${C.pink}15` : C.bg,
                          border: `2px solid ${isSelected ? C.pink : C.border}`,
                          borderRadius: 8, padding: 12, cursor: 'pointer',
                          transition: 'border-color 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: isSelected ? C.pink : C.muted, fontWeight: 700 }}>
                            VARIANT {i + 1} {isSelected ? '  SELECTED' : ''}
                          </span>
                          {isSelected && <span style={{ fontSize: 16, color: C.pink }}>✓</span>}
                        </div>
                        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>{v.primaryText}</div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                          <span><span style={{ color: C.muted }}>Headline:</span> <span style={{ color: C.text, fontWeight: 600 }}>{v.headline}</span></span>
                          <span><span style={{ color: C.muted }}>Desc:</span> <span style={{ color: C.text }}>{v.description}</span></span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Step 3: Preview & Set Live */}
            {replaceSelectedVariant && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                  STEP 3: REVIEW & SET LIVE
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: 12, borderLeft: `3px solid ${C.green}` }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>WHAT WILL HAPPEN (1 atomic batch)</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                    1. Ad will be <strong style={{ color: C.red }}>PAUSED</strong> immediately (stops spend)<br/>
                    2. {replaceImageUrl ? 'Creative swapped with new image/video' : 'Copy updated (existing visual kept)'}: "{replaceSelectedVariant.primaryText.slice(0, 50)}..."<br/>
                    3. Baseline CPA/ROAS/frequency captured from adset<br/>
                    4. Ad <strong style={{ color: C.green }}>REACTIVATED</strong> with fresh creative<br/>
                    5. CPA impact tracking starts (3d / 5d / 7d comparison)
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => {
                resolveAlert(resolveTarget.id)
                setResolveTarget(null)
              }} style={{ ...btnStyle(C.muted), fontSize: 11 }}>
                Just Dismiss (no action)
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setResolveTarget(null)} style={btnStyle(C.muted)}>Cancel</button>
                <button
                  onClick={executeReplace}
                  disabled={replacing || !replaceSelectedVariant}
                  style={{
                    ...btnStyle(C.green), fontWeight: 700, fontSize: 13,
                    opacity: replaceSelectedVariant ? 1 : 0.4,
                    cursor: replaceSelectedVariant ? 'pointer' : 'not-allowed'
                  }}
                >
                  {replacing ? 'Pausing → Replacing → Activating...' : 'Pause & Replace Creative'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Pre-Launch Confirmation Modal ─────────────────────────────────── */}
      {activateTarget && (
        <div onClick={() => setActivateTarget(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, maxWidth: 520, width: '95%', padding: 24, border: `2px solid ${C.green}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>
              Confirm: Set Ad Live
            </div>

            {/* Destination */}
            <div style={{ background: C.bg, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>DESTINATION</div>
              <div style={{ fontSize: 13, color: C.text }}>
                <span style={{ color: C.muted }}>Campaign:</span> {activateTarget.campaignName || '--'}
              </div>
              <div style={{ fontSize: 13, color: C.text }}>
                <span style={{ color: C.muted }}>Ad Set:</span> {activateTarget.adSetName || '--'}
              </div>
            </div>

            {/* Current adset metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ background: C.bg, borderRadius: 6, padding: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: C.muted }}>Current CPA</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{fmt$(activateTarget.baseline?.cpa || 0)}</div>
              </div>
              <div style={{ background: C.bg, borderRadius: 6, padding: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: C.muted }}>Current ROAS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{fmtX(activateTarget.baseline?.roas || 0)}</div>
              </div>
              <div style={{ background: C.bg, borderRadius: 6, padding: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: C.muted }}>Frequency</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: (activateTarget.baseline?.frequency || 0) > 4 ? C.red : C.text }}>
                  {activateTarget.baseline?.frequency?.toFixed(1) || '--'}
                </div>
              </div>
            </div>

            {/* Ad details */}
            <div style={{ background: C.bg, borderRadius: 8, padding: 12, marginBottom: 12, borderLeft: `3px solid ${C.pink}` }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>AD TO ACTIVATE</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>{activateTarget.adName || '--'}</div>
              {activateTarget.copyPreview?.primaryText && (
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{activateTarget.copyPreview.primaryText}</div>
              )}
            </div>

            <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>
              This will activate the ad on Meta and start tracking CPA impact at 3d, 5d, 7d.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setActivateTarget(null)} style={btnStyle(C.muted)}>Cancel</button>
              <button onClick={doActivateAd} disabled={activating} style={{ ...btnStyle(C.green), fontWeight: 700, fontSize: 13 }}>
                {activating ? 'Activating...' : 'Confirm: Set Live'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ───────────────────────────────────────────────────────────

const MetaLogo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879v-6.988h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" fill="#1877F2"/>
  </svg>
)

const GoogleLogo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

function HeroCard({ label, value, sub, color, icon }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || C.text, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function FatigueBar({ score, status }) {
  const color = score >= 75 ? C.green : score >= 50 ? C.yellow : score >= 25 ? C.orange : C.red
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 40, height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score || 0}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color }}>{score || 0}</span>
    </div>
  )
}

function ScaleButton({ entityId, entityName, currentBudget, roas, onScale, scaling, isMobile }) {
  const [show, setShow] = useState(false)
  const [pct, setPct] = useState(15)
  if (!show) return <button onClick={e => { e.stopPropagation(); setShow(true) }} style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}>Scale</button>
  const extra = (currentBudget || 0) * (pct / 100)
  const expectedRev = extra * (roas || 3)
  const expectedProfit = (expectedRev * 0.40) - extra
  return (
    <div style={{ background: C.bg, borderRadius: 6, padding: 8, minWidth: isMobile ? 180 : 220 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
        <select value={pct} onChange={e => setPct(Number(e.target.value))} style={sel}>{[5, 8, 10, 12, 15, 18].map(p => <option key={p} value={p}>{p}%</option>)}</select>
        <button onClick={e => { e.stopPropagation(); onScale(entityId, pct) }} disabled={scaling} style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}>{scaling ? '...' : 'Execute'}</button>
        <button onClick={e => { e.stopPropagation(); setShow(false) }} style={{ ...btnSm, color: C.muted, cursor: 'pointer', minHeight: isMobile ? 44 : 'auto' }}>X</button>
      </div>
      <div style={{ fontSize: 11, color: C.muted }}>Current: {fmt$(currentBudget)}/day {'\u2192'} New: {fmt$((currentBudget || 0) * (1 + pct / 100))}/day</div>
      <div style={{ fontSize: 11, color: C.green }}>Expected: +{fmt$(expectedRev)} rev/day, +{fmt$(expectedProfit)} profit/day ({roas || 3}x ROAS)</div>
    </div>
  )
}

function ScaleInline({ target, onScale, onCancel, scaling, isMobile }) {
  const [pct, setPct] = useState(15)
  const extra = (target.budget || 0) * (pct / 100)
  const expectedRev = extra * (target.roas || 3)
  const expectedProfit = (expectedRev * 0.40) - extra
  return (
    <div style={{ background: C.bg, borderRadius: 6, padding: 6, minWidth: isMobile ? 160 : 200 }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 3 }}>
        <select value={pct} onChange={e => setPct(Number(e.target.value))} style={sel}>{[5, 8, 10, 12, 15, 18].map(p => <option key={p} value={p}>{p}%</option>)}</select>
        <button onClick={e => { e.stopPropagation(); onScale(target.id, pct) }} disabled={scaling} style={{ ...btnStyle(C.green), minHeight: isMobile ? 44 : 'auto' }}>{scaling ? '...' : 'Go'}</button>
        <button onClick={e => { e.stopPropagation(); onCancel() }} style={{ ...btnSm, color: C.muted, cursor: 'pointer', minHeight: isMobile ? 44 : 'auto' }}>X</button>
      </div>
      <div style={{ fontSize: 10, color: C.muted }}>{fmt$(target.budget)}/day {'\u2192'} {fmt$((target.budget || 0) * (1 + pct / 100))}/day</div>
      <div style={{ fontSize: 10, color: C.green }}>+{fmt$(expectedRev)} rev, +{fmt$(expectedProfit)} profit ({(target.roas || 3).toFixed(1)}x)</div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', color: C.text }
const secTitle = { fontSize: 15, fontWeight: 600, margin: '0 0 8px', color: C.text }
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const th = { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', background: C.card }
const td = { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top', color: C.text }
const sel = { background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 4px', fontSize: 11 }

function btnStyle(color) {
  return { background: `${color}30`, color, border: `1px solid ${color}66`, borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
}
const btnSm = { background: `${C.blue}30`, color: C.blue, border: `1px solid ${C.blue}66`, borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }

function badge(color) {
  return { display: 'inline-block', background: `${color}38`, color, border: `1px solid ${color}66`, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }
}

function recBadge(color) {
  return { display: 'inline-block', background: `${color}40`, color, border: `2px solid ${color}88`, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.3px' }
}
