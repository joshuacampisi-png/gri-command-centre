/**
 * Competitor Intelligence Dashboard
 * Organised by competitor: Meta Ads > Google Paid > Google Organic > Visibility
 */

import { useState, useEffect, useCallback } from 'react'

export default function CompetitorIntelligence() {
  const [overview, setOverview] = useState(null)
  const [competitors, setCompetitors] = useState({})
  const [selectedComp, setSelectedComp] = useState(null)
  const [scanning, setScanning] = useState({ organic: false, paid: false, meta: false, all: false })
  const [scanMsg, setScanMsg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('meta')

  const load = useCallback(async () => {
    try {
      const [overviewRes, configRes] = await Promise.all([
        fetch('/api/competitors/overview').then(r => r.json()),
        fetch('/api/competitors/config').then(r => r.json()),
      ])
      setOverview(overviewRes)
      setCompetitors(configRes.competitors || {})
      // Default to first rival
      if (!selectedComp) {
        const firstRival = Object.entries(configRes.competitors || {}).find(([, v]) => !v.isOwn)
        if (firstRival) setSelectedComp(firstRival[0])
      }
      setLoading(false)
    } catch (e) {
      console.error('Failed to load competitor data:', e)
      setLoading(false)
    }
  }, [selectedComp])

  useEffect(() => { load() }, [load])

  // Poll every 5s while scanning, every 30s otherwise
  useEffect(() => {
    const isScanning = scanning.organic || scanning.paid || scanning.meta || scanning.all
    const interval = setInterval(load, isScanning ? 5000 : 30000)
    return () => clearInterval(interval)
  }, [scanning, load])

  // Track scan timestamps to detect completion
  const [scanStartTimes, setScanStartTimes] = useState({})

  useEffect(() => {
    // Auto-detect scan completion by checking if data timestamps changed
    const isScanning = scanning.organic || scanning.paid || scanning.meta || scanning.all
    if (!isScanning || !overview) return

    const organicTime = overview.organic?.scannedAt
    const paidTime = overview.paid?.scannedAt
    const metaTime = overview.meta?.scannedAt

    if (scanning.organic && organicTime && organicTime !== scanStartTimes.organic) {
      setScanning(prev => ({ ...prev, organic: false }))
      setScanMsg({ ok: true, text: 'Organic scan complete!' })
    }
    if (scanning.paid && paidTime && paidTime !== scanStartTimes.paid) {
      setScanning(prev => ({ ...prev, paid: false }))
      setScanMsg({ ok: true, text: 'Google Ads scan complete!' })
    }
    if (scanning.meta && metaTime && metaTime !== scanStartTimes.meta) {
      setScanning(prev => ({ ...prev, meta: false }))
      setScanMsg({ ok: true, text: 'Meta Ads scan complete!' })
    }
    if (scanning.all && organicTime && organicTime !== scanStartTimes.organic) {
      setScanning(prev => ({ ...prev, all: false }))
      setScanMsg({ ok: true, text: 'Full scan complete!' })
    }
  }, [overview, scanning, scanStartTimes])

  async function triggerScan(type) {
    // Record current timestamps so we can detect when new data arrives
    setScanStartTimes({
      organic: overview?.organic?.scannedAt || null,
      paid: overview?.paid?.scannedAt || null,
      meta: overview?.meta?.scannedAt || null,
    })
    setScanning(prev => ({ ...prev, [type]: true }))
    setScanMsg(null)
    try {
      const endpoint = type === 'all' ? '/api/competitors/scan-all'
        : type === 'organic' ? '/api/competitors/organic/scan'
        : type === 'paid' ? '/api/competitors/google-ads/scan'
        : '/api/competitors/meta-ads/scan'

      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()
      setScanMsg({ ok: data.ok, text: (data.message || 'Scan started') + ' — refreshing automatically...' })

      // Safety timeout: stop scanning state after 5 min max
      setTimeout(() => {
        setScanning(prev => ({ ...prev, [type]: false }))
        load()
      }, 300000)
    } catch (e) {
      setScanMsg({ ok: false, text: e.message })
      setScanning(prev => ({ ...prev, [type]: false }))
    }
  }

  if (loading) {
    return (
      <div className="page comp-page">
        <div className="page-header">
          <div><h2 className="page-title">Competitor Intelligence</h2></div>
        </div>
        <div className="card">Loading competitor data...</div>
      </div>
    )
  }

  const organic = overview?.organic || null
  const paid = overview?.paid || null
  const meta = overview?.meta || null
  const compEntries = Object.entries(competitors)
  const rivals = compEntries.filter(([, v]) => !v.isOwn)
  const gri = compEntries.find(([, v]) => v.isOwn)

  // Get data for selected competitor
  const compOrganic = organic?.keywords?.map(kw => ({
    keyword: kw.keyword,
    griRank: kw.positions?.gri?.rank,
    compRank: kw.positions?.[selectedComp]?.rank,
    compUrl: kw.positions?.[selectedComp]?.url,
  })).filter(k => k.compRank || k.griRank) || []

  const compPaid = paid?.competitors?.[selectedComp] || null
  const compMeta = meta?.competitors?.[selectedComp] || null
  const griPaid = paid?.competitors?.gri || null

  return (
    <div className="page comp-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Competitor Intelligence</h2>
          <p className="page-sub">Deep dive into each competitor across Meta, Google Ads, Organic, and Visibility</p>
        </div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => triggerScan('all')} disabled={scanning.all}>
            {scanning.all ? 'Scanning All...' : 'Scan All Now'}
          </button>
        </div>
      </div>

      {scanMsg && (
        <div style={{ padding: '8px 14px', borderRadius: 'var(--radius)', fontSize: '13px', background: scanMsg.ok ? 'var(--green-bg)' : 'var(--red-bg)', color: scanMsg.ok ? 'var(--green)' : 'var(--red)', marginBottom: '16px' }}>
          {scanMsg.text}
        </div>
      )}

      {/* Competitor Selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {rivals.map(([id, comp]) => (
          <button
            key={id}
            className={selectedComp === id ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setSelectedComp(id)}
            style={selectedComp === id ? { borderColor: comp.color, background: comp.color + '15' } : {}}
          >
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: comp.color, marginRight: 6 }} />
            {comp.name}
          </button>
        ))}
      </div>

      {selectedComp && competitors[selectedComp] && (
        <>
          {/* Competitor Header Card */}
          <CompetitorHeaderCard
            comp={competitors[selectedComp]}
            organic={organic}
            paid={compPaid}
            meta={compMeta}
            compId={selectedComp}
          />

          {/* Section Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', marginTop: '20px' }}>
            {[
              { key: 'meta', label: 'Meta Ads', icon: '📱' },
              { key: 'paid', label: 'Google Paid', icon: '💰' },
              { key: 'organic', label: 'Google Organic', icon: '🔍' },
              { key: 'visibility', label: 'Visibility', icon: '📊' },
            ].map(tab => (
              <button
                key={tab.key}
                className={activeSection === tab.key ? 'filter-btn active' : 'filter-btn'}
                onClick={() => setActiveSection(tab.key)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Meta Ads Section */}
          {activeSection === 'meta' && (
            <MetaAdsSection
              data={compMeta}
              compName={competitors[selectedComp].name}
              onScan={() => triggerScan('meta')}
              scanning={scanning.meta}
            />
          )}

          {/* Google Paid Section */}
          {activeSection === 'paid' && (
            <GooglePaidSection
              data={compPaid}
              griData={griPaid}
              compName={competitors[selectedComp].name}
              onScan={() => triggerScan('paid')}
              scanning={scanning.paid}
            />
          )}

          {/* Google Organic Section */}
          {activeSection === 'organic' && (
            <OrganicSection
              data={compOrganic}
              summary={organic?.summary}
              compId={selectedComp}
              compName={competitors[selectedComp].name}
              onScan={() => triggerScan('organic')}
              scanning={scanning.organic}
            />
          )}

          {/* Visibility Section */}
          {activeSection === 'visibility' && (
            <VisibilitySection
              organic={organic}
              paid={paid}
              compId={selectedComp}
              competitors={competitors}
            />
          )}
        </>
      )}

      {/* Scan Timestamps */}
      <div style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-faint)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {organic?.scannedAt && <span>Organic: {formatDate(organic.scannedAt)}</span>}
        {paid?.scannedAt && <span>Google Ads: {formatDate(paid.scannedAt)}</span>}
        {meta?.scannedAt && <span>Meta Ads: {formatDate(meta.scannedAt)}</span>}
      </div>
    </div>
  )
}

// ── Competitor Header Card ───────────────────────────────────────────────────

function CompetitorHeaderCard({ comp, organic, paid, meta, compId }) {
  const organicSummary = organic?.summary?.[compId]
  const paidMetrics = paid?.metrics
  const metaCount = meta?.totalActiveAds || 0

  return (
    <div className="card" style={{ borderLeft: `4px solid ${comp.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text)', letterSpacing: '-0.02em' }}>{comp.name}</h3>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{comp.domain}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        <MiniStat label="Organic Top 3" value={organicSummary?.top3 ?? 0} color="var(--text)" />
        <MiniStat label="Organic Top 10" value={organicSummary?.top10 ?? 0} color="var(--text)" />
        <MiniStat label="Avg Rank" value={organicSummary?.avgRank ? `#${organicSummary.avgRank}` : 'N/A'} color="var(--text)" />
        <MiniStat label="Paid Keywords" value={paidMetrics?.paidKeywords ?? 0} color="var(--text)" />
        <MiniStat label="Est. Ad Spend" value={paidMetrics?.estimatedCost ? `$${paidMetrics.estimatedCost.toFixed(0)}` : 'N/A'} color="var(--text)" />
        <MiniStat label="Active Meta Ads" value={metaCount} color="var(--text)" />
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, color: color || 'var(--text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
    </div>
  )
}

// ── Meta Ads Section ─────────────────────────────────────────────────────────

function MetaAdsSection({ data, compName, onScan, scanning }) {
  if (!data || !data.ads || data.ads.length === 0) {
    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>Meta Ads</h3>
          <button className="btn-outline" onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Meta Ads'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No Meta ads found for {compName}. Run a scan to check.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, color: 'var(--text)', letterSpacing: '-0.02em' }}>Meta Ads ({data.totalActiveAds} active)</h3>
          <button className="btn-outline" onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Meta Ads'}
          </button>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Last scanned: {data.lastScanned ? formatDate(data.lastScanned) : 'Never'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
        {data.ads.map((ad, i) => (
          <div key={ad.id || i} className="card" style={{ padding: '14px' }}>
            {/* Ad Image */}
            {(ad.localImagePath || ad.imageUrl) && (
              <div style={{ marginBottom: '12px', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--bg-subtle)', maxHeight: '200px' }}>
                <img
                  src={ad.localImagePath || ad.imageUrl}
                  alt={ad.headline || 'Ad creative'}
                  style={{ width: '100%', height: 'auto', objectFit: 'cover', display: 'block' }}
                  onError={e => { e.target.style.display = 'none' }}
                />
              </div>
            )}

            {/* Ad Content */}
            {ad.headline && (
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px', color: 'var(--text)' }}>{ad.headline}</div>
            )}
            {ad.adText && (
              <div style={{ fontSize: '13px', color: 'var(--text-soft)', marginBottom: '8px', lineHeight: '1.4' }}>
                {ad.adText.length > 200 ? ad.adText.substring(0, 200) + '...' : ad.adText}
              </div>
            )}
            {ad.cta && (
              <div style={{ display: 'inline-block', padding: '4px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-soft)' }}>
                {ad.cta}
              </div>
            )}

            {/* Ad Meta */}
            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-faint)', marginTop: '8px', flexWrap: 'wrap' }}>
              {ad.platforms && <span>Platforms: {Array.isArray(ad.platforms) ? ad.platforms.join(', ') : ad.platforms}</span>}
              {ad.startDate && <span>Started: {formatDate(ad.startDate)}</span>}
              <span style={{ color: ad.status === 'active' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                {ad.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Google Paid Section ──────────────────────────────────────────────────────

function GooglePaidSection({ data, griData, compName, onScan, scanning }) {
  if (!data) {
    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>Google Ads Intelligence</h3>
          <button className="btn-outline" onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Google Ads'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No Google Ads data for {compName}. Run a scan to check.</p>
      </div>
    )
  }

  const metrics = data.metrics || {}
  const keywords = data.paidKeywords || []
  const adCopy = data.adCopy || []

  return (
    <div>
      {/* Metrics Summary */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: 'var(--text)', letterSpacing: '-0.02em' }}>Google Ads Intelligence</h3>
          <button className="btn-outline" onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Google Ads'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
          <MiniStat label="Paid Keywords" value={metrics.paidKeywords || 0} color="var(--text)" />
          <MiniStat label="Est. Traffic" value={metrics.estimatedTraffic || 0} color="var(--text)" />
          <MiniStat label="Est. Cost" value={`$${(metrics.estimatedCost || 0).toFixed(0)}`} color="var(--text)" />
          <MiniStat label="Top 1 Positions" value={metrics.topPositions || 0} color="var(--text)" />
          <MiniStat label="Visibility" value={`${data.visibilityShare || 0}%`} color="var(--text)" />
        </div>

        {/* Comparison vs GRI */}
        {griData && (
          <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-soft)' }}>
            <strong style={{ color: 'var(--text)' }}>vs Gender Reveal Ideas:</strong>{' '}
            {data.visibilityShare > (griData.visibilityShare || 0)
              ? <span style={{ color: 'var(--red)' }}>They have {data.visibilityShare - (griData.visibilityShare || 0)}% more visibility</span>
              : <span style={{ color: 'var(--green)' }}>You have {(griData.visibilityShare || 0) - data.visibilityShare}% more visibility</span>
            }
          </div>
        )}
      </div>

      {/* Keywords they're bidding on */}
      {keywords.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <h4 style={{ marginBottom: '12px', color: 'var(--text)', letterSpacing: '-0.02em' }}>Keywords Bidding On ({keywords.length})</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-canvas)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Keyword</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Position</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>CPC</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Search Vol</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Est. Traffic</th>
                </tr>
              </thead>
              <tbody>
                {keywords.slice(0, 30).map((kw, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 500, color: 'var(--text)' }}>{kw.keyword}</td>
                    <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                      {kw.position ? (
                        <span style={{
                          padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                          background: kw.position <= 3 ? 'var(--green-bg)' : kw.position <= 10 ? 'var(--amber-bg)' : 'var(--red-bg)',
                          color: kw.position <= 3 ? 'var(--green)' : kw.position <= 10 ? 'var(--amber)' : 'var(--red)',
                        }}>
                          #{kw.position}
                        </span>
                      ) : 'N/A'}
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' }}>${kw.cpc?.toFixed(2) || '0.00'}</td>
                    <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' }}>{kw.searchVolume?.toLocaleString() || 0}</td>
                    <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' }}>{kw.estimatedTraffic || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ad Copy */}
      {adCopy.length > 0 && (
        <div className="card">
          <h4 style={{ marginBottom: '12px', color: 'var(--text)', letterSpacing: '-0.02em' }}>Their Ad Copy ({adCopy.length})</h4>
          <div style={{ display: 'grid', gap: '12px' }}>
            {adCopy.slice(0, 10).map((ad, i) => (
              <div key={i} style={{ padding: '12px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', borderLeft: '3px solid var(--amber)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{ad.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--green)', marginBottom: '6px' }}>{ad.breadcrumb || ad.url}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-soft)', lineHeight: '1.4' }}>{ad.description}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '6px' }}>Keyword: "{ad.keyword}" | Position: #{ad.position || '?'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Organic Section ──────────────────────────────────────────────────────────

function OrganicSection({ data, summary, compId, compName, onScan, scanning }) {
  const compSummary = summary?.[compId]
  const griSummary = summary?.gri

  if (!data || data.length === 0) {
    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>Organic Rankings</h3>
          <button className="btn-outline" onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Organic'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No organic data for {compName}. Run a scan to check.</p>
      </div>
    )
  }

  // Calculate head-to-head
  const griWins = data.filter(k => k.griRank && k.compRank && k.griRank < k.compRank).length
  const compWins = data.filter(k => k.griRank && k.compRank && k.compRank < k.griRank).length
  const bothRanked = data.filter(k => k.griRank && k.compRank).length

  return (
    <div>
      {/* Summary */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: 'var(--text)', letterSpacing: '-0.02em' }}>Organic Rankings vs {compName}</h3>
          <button className="btn-outline" onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Organic'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <MiniStat label="Their Top 3" value={compSummary?.top3 ?? 0} color="var(--text)" />
          <MiniStat label="Their Top 10" value={compSummary?.top10 ?? 0} color="var(--text)" />
          <MiniStat label="Their Avg Rank" value={compSummary?.avgRank ? `#${compSummary.avgRank}` : 'N/A'} color="var(--text)" />
          <MiniStat label="You Win" value={griWins} color="var(--green)" />
          <MiniStat label="They Win" value={compWins} color="var(--red)" />
          <MiniStat label="Win Rate" value={bothRanked > 0 ? `${Math.round((griWins / bothRanked) * 100)}%` : 'N/A'} color={griWins > compWins ? 'var(--green)' : 'var(--red)'} />
        </div>
      </div>

      {/* Head to Head Table */}
      <div className="card">
        <h4 style={{ marginBottom: '12px', color: 'var(--text)', letterSpacing: '-0.02em' }}>Keyword Rankings Comparison</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-canvas)' }}>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Keyword</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--gri-pink)' }}>GRI</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>{compName.split(' ')[0]}</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Winner</th>
              </tr>
            </thead>
            <tbody>
              {data.sort((a, b) => {
                // Sort by: both ranked first, then by GRI rank
                const aHasBoth = a.griRank && a.compRank
                const bHasBoth = b.griRank && b.compRank
                if (aHasBoth && !bHasBoth) return -1
                if (!aHasBoth && bHasBoth) return 1
                return (a.griRank || 999) - (b.griRank || 999)
              }).map((kw, i) => {
                const griWins = kw.griRank && kw.compRank && kw.griRank < kw.compRank
                const compWinsKw = kw.griRank && kw.compRank && kw.compRank < kw.griRank

                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 500, color: 'var(--text)' }}>{kw.keyword}</td>
                    <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                      <RankBadge rank={kw.griRank} isWinner={griWins} />
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                      <RankBadge rank={kw.compRank} isWinner={compWinsKw} />
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px 8px', fontSize: '12px', fontWeight: 600 }}>
                      {griWins && <span style={{ color: 'var(--green)' }}>You</span>}
                      {compWinsKw && <span style={{ color: 'var(--red)' }}>Them</span>}
                      {!griWins && !compWinsKw && <span style={{ color: 'var(--text-faint)' }}>N/A</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function RankBadge({ rank, isWinner }) {
  if (!rank) return <span style={{ color: 'var(--text-faint)' }}>Not ranked</span>
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
      background: isWinner ? 'var(--green-bg)' : rank <= 3 ? 'var(--blue-bg)' : rank <= 10 ? 'var(--amber-bg)' : 'var(--red-bg)',
      color: isWinner ? 'var(--green)' : rank <= 3 ? 'var(--blue)' : rank <= 10 ? 'var(--amber)' : 'var(--red)',
    }}>
      #{rank}
    </span>
  )
}

// ── Visibility Section ───────────────────────────────────────────────────────

function VisibilitySection({ organic, paid, compId, competitors }) {
  const allComps = Object.entries(competitors)

  // Calculate estimated market share from organic + paid combined
  const marketData = allComps.map(([id, comp]) => {
    const orgSummary = organic?.summary?.[id]
    const paidData = paid?.competitors?.[id]

    // Organic visibility score: weighted by rank positions
    const organicScore = (orgSummary?.top3 || 0) * 100 + (orgSummary?.top10 || 0) * 50 + (orgSummary?.ranked || 0) * 10

    // Paid visibility score
    const paidScore = (paidData?.metrics?.estimatedTraffic || 0) + (paidData?.metrics?.paidKeywords || 0) * 10

    return {
      id,
      name: comp.name,
      domain: comp.domain,
      color: comp.color,
      isOwn: comp.isOwn,
      organicScore,
      paidScore,
      totalScore: organicScore + paidScore,
      organicTop3: orgSummary?.top3 || 0,
      organicTop10: orgSummary?.top10 || 0,
      avgRank: orgSummary?.avgRank || null,
      paidKeywords: paidData?.metrics?.paidKeywords || 0,
      estSpend: paidData?.metrics?.estimatedCost || 0,
      estTraffic: paidData?.metrics?.estimatedTraffic || 0,
      visibilityShare: paidData?.visibilityShare || 0,
    }
  })

  const totalScore = marketData.reduce((sum, d) => sum + d.totalScore, 0)
  marketData.forEach(d => {
    d.marketShare = totalScore > 0 ? Math.round((d.totalScore / totalScore) * 100) : 0
  })

  // Sort by total score descending
  marketData.sort((a, b) => b.totalScore - a.totalScore)

  return (
    <div>
      {/* Market Share Overview */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <h3 style={{ marginBottom: '8px', color: 'var(--text)', letterSpacing: '-0.02em' }}>Estimated Market Visibility</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Combined organic + paid visibility across all tracked keywords
        </p>

        {/* Bar Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {marketData.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '160px', fontSize: '13px', fontWeight: d.isOwn ? 600 : 500, color: d.isOwn ? 'var(--text)' : 'var(--text-soft)' }}>
                {d.name}
              </div>
              <div style={{ flex: 1, height: '24px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <div style={{
                  width: `${d.marketShare}%`,
                  height: '100%',
                  background: d.color,
                  borderRadius: 'var(--radius-sm)',
                  minWidth: d.marketShare > 0 ? '4px' : '0',
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ width: '40px', fontSize: '13px', fontWeight: 600, textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {d.marketShare}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full Comparison Table */}
      <div className="card">
        <h4 style={{ marginBottom: '12px', color: 'var(--text)', letterSpacing: '-0.02em' }}>Full Comparison</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-canvas)' }}>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Competitor</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Market Share</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Organic Top 3</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Organic Top 10</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Avg Rank</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Paid Keywords</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>Est. Ad Spend</th>
              </tr>
            </thead>
            <tbody>
              {marketData.map(d => (
                <tr key={d.id} style={{
                  borderTop: '1px solid var(--border)',
                  background: d.isOwn ? 'var(--green-bg)' : d.id === compId ? 'var(--bg-canvas)' : 'transparent',
                }}>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                      <span style={{ fontWeight: d.isOwn ? 600 : 500, color: 'var(--text)' }}>{d.name}</span>
                      {d.isOwn && <span style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 600 }}>(YOU)</span>}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{d.marketShare}%</td>
                  <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' }}>{d.organicTop3}</td>
                  <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' }}>{d.organicTop10}</td>
                  <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' }}>{d.avgRank ? `#${d.avgRank}` : 'N/A'}</td>
                  <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' }}>{d.paidKeywords}</td>
                  <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' }}>${d.estSpend.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString('en-AU', {
      timeZone: 'Australia/Brisbane',
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return dateStr
  }
}
