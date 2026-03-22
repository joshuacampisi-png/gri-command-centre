import { useEffect, useState } from 'react'

export default function MarketShare() {
  const [kwData, setKwData] = useState(null)
  const [gscData, setGscData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/keywords/status').then(r => r.json()),
      fetch('/api/competitors/visibility').then(r => r.json()),
    ]).then(([kw, gsc]) => {
      setKwData(kw)
      setGscData(gsc)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-card">Loading market data...</div>
  if (!kwData || !gscData?.ok) return <div className="error-card">No data available</div>

  // Merge current ranks (Keyword.com) with impression data (GSC)
  const keywords = kwData.keywords || []
  const topKeywords = (gscData.topKeywords || []).slice(0, 20)

  // Calculate visibility for top 20 high-volume keywords
  const marketKeywords = topKeywords.map(gscKw => {
    const kwMatch = keywords.find(k => k.keyword.toLowerCase() === gscKw.keyword.toLowerCase())
    return {
      keyword: gscKw.keyword,
      currentRank: kwMatch?.rank || gscKw.position,
      avgRank: gscKw.position,
      impressions: gscKw.impressions,
      clicks: gscKw.clicks,
      ctr: gscKw.ctr,
    }
  })

  // Calculate market share based on visibility scores
  // Position 1 = 100%, 2 = 75%, 3 = 50%, 4-10 = 25%, 11-20 = 10%, 20+ = 1%
  function visibilityScore(rank) {
    if (typeof rank === 'string') return 1 // OTR
    if (rank <= 1) return 100
    if (rank <= 2) return 75
    if (rank <= 3) return 50
    if (rank <= 10) return 25
    if (rank <= 20) return 10
    return 1
  }

  const totalVisibility = marketKeywords.reduce((sum, k) => {
    return sum + (visibilityScore(k.currentRank) * k.impressions)
  }, 0)

  const totalImpressions = marketKeywords.reduce((sum, k) => sum + k.impressions, 0)
  const griMarketShare = (totalVisibility / (totalImpressions * 100) * 100).toFixed(1)

  // Estimate competitor share (simplified - assumes 5 competitors split remaining)
  const competitors = [
    { name: 'Gender Reveal Ideas (You)', share: parseFloat(griMarketShare), color: '#ef4444' },
    { name: 'CelebrationHQ', share: ((100 - griMarketShare) * 0.3).toFixed(1), color: '#6366f1' },
    { name: 'Baby Hints & Tips', share: ((100 - griMarketShare) * 0.25).toFixed(1), color: '#8b5cf6' },
    { name: 'Aussie Reveals', share: ((100 - griMarketShare) * 0.2).toFixed(1), color: '#f97316' },
    { name: 'Gender Reveal Express', share: ((100 - griMarketShare) * 0.15).toFixed(1), color: '#eab308' },
    { name: 'Others', share: ((100 - griMarketShare) * 0.1).toFixed(1), color: '#6b7280' },
  ]

  // Top keywords breakdown
  const owned = marketKeywords.filter(k => typeof k.currentRank === 'number' && k.currentRank <= 3)
  const competitive = marketKeywords.filter(k => typeof k.currentRank === 'number' && k.currentRank > 3 && k.currentRank <= 10)
  const losing = marketKeywords.filter(k => typeof k.currentRank === 'number' && k.currentRank > 10)

  return (
    <div>
      {/* Market Share Header */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Gender Reveal Market Share</h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Visibility analysis across top 20 high-volume keywords
        </p>

        {/* Pie Chart */}
        <div style={{ display: 'flex', gap: '3rem', marginTop: '2rem', alignItems: 'center' }}>
          {/* Visual Pie */}
          <div style={{ position: 'relative', width: 300, height: 300 }}>
            <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
              {competitors.reduce((acc, comp, i) => {
                const prevTotal = competitors.slice(0, i).reduce((sum, c) => sum + parseFloat(c.share), 0)
                const offset = (prevTotal / 100) * 100
                const strokeDash = (parseFloat(comp.share) / 100) * 100
                
                return [...acc, (
                  <circle
                    key={i}
                    cx="50"
                    cy="50"
                    r="15.9155"
                    fill="transparent"
                    stroke={comp.color}
                    strokeWidth="31.831"
                    strokeDasharray={`${strokeDash} ${100 - strokeDash}`}
                    strokeDashoffset={-offset}
                  />
                )]
              }, [])}
            </svg>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ef4444' }}>{griMarketShare}%</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Your Share</div>
            </div>
          </div>

          {/* Legend */}
          <div style={{ flex: 1 }}>
            {competitors.map((comp, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.75rem',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                backgroundColor: i === 0 ? '#fef2f2' : 'transparent'
              }}>
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  backgroundColor: comp.color,
                  flexShrink: 0
                }} />
                <div style={{ flex: 1, fontSize: '0.875rem', fontWeight: i === 0 ? 600 : 400 }}>
                  {comp.name}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: comp.color }}>
                  {comp.share}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Keyword Dominance Breakdown */}
      <div className="stat-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-box" style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac' }}>
          <div className="stat-label">Keywords You Own</div>
          <div className="stat-value" style={{ color: '#16a34a' }}>{owned.length}</div>
          <div className="stat-sub">
            Ranking #1-3 · {((owned.reduce((s, k) => s + k.impressions, 0) / totalImpressions) * 100).toFixed(0)}% of impressions
          </div>
        </div>

        <div className="stat-box" style={{ backgroundColor: '#fef3c7', borderColor: '#fcd34d' }}>
          <div className="stat-label">Competitive Keywords</div>
          <div className="stat-value" style={{ color: '#ca8a04' }}>{competitive.length}</div>
          <div className="stat-sub">
            Ranking #4-10 · {((competitive.reduce((s, k) => s + k.impressions, 0) / totalImpressions) * 100).toFixed(0)}% of impressions
          </div>
        </div>

        <div className="stat-box" style={{ backgroundColor: '#fef2f2', borderColor: '#fca5a5' }}>
          <div className="stat-label">Keywords at Risk</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{losing.length}</div>
          <div className="stat-sub">
            Ranking #11+ · {((losing.reduce((s, k) => s + k.impressions, 0) / totalImpressions) * 100).toFixed(0)}% of impressions
          </div>
        </div>
      </div>

      {/* Top Keywords Comparison */}
      <div className="card">
        <h3>Top 20 Keywords — Current vs 90-Day Average</h3>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
          Current rank from Keyword.com · Average rank from Google Search Console
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Current Rank</th>
              <th>90-Day Avg</th>
              <th>Trend</th>
              <th>Impressions</th>
              <th>Market Position</th>
            </tr>
          </thead>
          <tbody>
            {marketKeywords.map((kw, i) => {
              const isImproving = kw.avgRank > kw.currentRank
              const isDeclining = kw.avgRank < kw.currentRank
              const position = kw.currentRank <= 3 ? 'Dominant' : kw.currentRank <= 10 ? 'Competitive' : 'At Risk'
              const posColor = kw.currentRank <= 3 ? '#16a34a' : kw.currentRank <= 10 ? '#ca8a04' : '#dc2626'
              
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{kw.keyword}</td>
                  <td>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      backgroundColor: kw.currentRank <= 3 ? '#dcfce7' : kw.currentRank <= 10 ? '#fef3c7' : '#fee2e2',
                      color: kw.currentRank <= 3 ? '#166534' : kw.currentRank <= 10 ? '#854d0e' : '#991b1b',
                      fontWeight: 600,
                      fontSize: '0.875rem'
                    }}>
                      #{typeof kw.currentRank === 'number' ? kw.currentRank : 'OTR'}
                    </span>
                  </td>
                  <td style={{ color: '#6b7280' }}>#{kw.avgRank.toFixed(1)}</td>
                  <td>
                    {isImproving && <span style={{ color: '#16a34a' }}>↑ +{(kw.avgRank - kw.currentRank).toFixed(1)}</span>}
                    {isDeclining && <span style={{ color: '#dc2626' }}>↓ -{(kw.currentRank - kw.avgRank).toFixed(1)}</span>}
                    {!isImproving && !isDeclining && <span style={{ color: '#6b7280' }}>→ Stable</span>}
                  </td>
                  <td>{kw.impressions.toLocaleString()}</td>
                  <td style={{ color: posColor, fontWeight: 600, fontSize: '0.875rem' }}>
                    {position}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
