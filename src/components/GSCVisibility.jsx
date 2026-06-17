import { useEffect, useState } from 'react'

export default function GSCVisibility() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/competitors/visibility')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-card">Loading GSC data...</div>
  if (!data?.ok) return <div className="error-card">No GSC data. Upload latest Search Console export.</div>

  const { summary, distribution, competitive, topKeywords } = data

  return (
    <div>
      {/* Summary Cards */}
      <div className="stat-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-box">
          <div className="stat-label">Total Keywords</div>
          <div className="stat-value">{summary.totalKeywords.toLocaleString()}</div>
          <div className="stat-sub">{distribution.top3} in top-3, {distribution.top10} in top-10</div>
        </div>

        <div className="stat-box">
          <div className="stat-label">Total Impressions</div>
          <div className="stat-value">{(summary.totalImpressions / 1000).toFixed(0)}K</div>
          <div className="stat-sub">{summary.totalClicks.toLocaleString()} clicks ({summary.avgCTR}% CTR)</div>
        </div>

        <div className="stat-box">
          <div className="stat-label">Avg Position</div>
          <div className="stat-value">#{summary.avgPosition}</div>
          <div className="stat-sub">Visibility: {summary.visibilityScore}/100</div>
        </div>

        <div className="stat-box">
          <div className="stat-label">High-Volume Keywords</div>
          <div className="stat-value">{competitive.total}</div>
          <div className="stat-sub">{competitive.top3} in top-3 ({competitive.top3Pct}%)</div>
        </div>
      </div>

      {/* Distribution Chart */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3>Keyword Distribution</h3>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--green)' }}>Top 3</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{distribution.top3}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {(distribution.top3 / summary.totalKeywords * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--blue)' }}>Top 10</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{distribution.top10}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {(distribution.top10 / summary.totalKeywords * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--amber)' }}>Top 20</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{distribution.top20}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {(distribution.top20 / summary.totalKeywords * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--red)' }}>Below 20</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{distribution.below20}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {(distribution.below20 / summary.totalKeywords * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Top Opportunities */}
      <div className="card">
        <h3>Top Opportunities (High Volume Keywords)</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Keywords with highest impressions - improve these for maximum impact
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Position</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>CTR</th>
              <th>Opportunity</th>
            </tr>
          </thead>
          <tbody>
            {topKeywords.map((kw, i) => {
              const opportunity = kw.position > 3 && kw.impressions > 1000
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{kw.keyword}</td>
                  <td>
                    <span className={`status-badge ${kw.rank}`}>
                      #{kw.position.toFixed(1)}
                    </span>
                  </td>
                  <td>{kw.impressions.toLocaleString()}</td>
                  <td>{kw.clicks.toLocaleString()}</td>
                  <td>{kw.ctr.toFixed(2)}%</td>
                  <td>
                    {opportunity && (
                      <span style={{ color: 'var(--amber)', fontSize: '0.875rem' }}>
                        ⚠️ Move to top-3 for +{((kw.impressions * 0.05) - kw.clicks).toFixed(0)} clicks/mo
                      </span>
                    )}
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
