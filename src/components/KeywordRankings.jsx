/**
 * Keyword Rankings Dashboard Component
 * Shows current keyword positions, rank changes, alerts
 * With clear improving/declining keyword lists
 */

import { useState, useEffect } from 'react'

const LOCATION_LABELS = {
  'google.com.au': 'AU',
  'google.co.nz': 'NZ',
  'google.com': 'US'
}

function locationLabel(loc) {
  return LOCATION_LABELS[loc] || loc || ''
}

// Sanitise: fix bad change data and deduplicate keywords per location
function sanitiseKeywords(keywords) {
  // First sanitise change data
  const sanitised = keywords.map(kw => {
    const prevRank = kw.prevRank || 0
    const change = kw.change || 0
    const isBadData = prevRank === 0 || prevRank === null || Math.abs(change) > 30
    return {
      ...kw,
      change: isBadData ? 0 : change,
      prevRank: isBadData ? null : prevRank,
      status: isBadData ? 'STABLE' : kw.status
    }
  })

  // Deduplicate: keep best rank per keyword+location combo
  const seen = new Map()
  for (const kw of sanitised) {
    const key = `${kw.keyword.toLowerCase()}|${kw.location || ''}`
    const existing = seen.get(key)
    if (!existing || (kw.rank !== null && (existing.rank === null || kw.rank < existing.rank))) {
      seen.set(key, kw)
    }
  }
  return Array.from(seen.values())
}

export default function KeywordRankings() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const res = await fetch('/api/keywords/status')
      const json = await res.json()
      setData(json)
      setLoading(false)
    } catch (err) {
      console.error('Failed to load keywords:', err)
      setLoading(false)
    }
  }

  async function triggerRefresh() {
    setLoading(true)
    try {
      await fetch('/api/keywords/refresh', { method: 'POST' })
      await loadData()
    } catch (err) {
      console.error('Refresh failed:', err)
      setLoading(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="card">
        <h2>Keyword Rankings</h2>
        <p>Loading keyword data...</p>
      </div>
    )
  }

  if (!data || !data.keywords) {
    return (
      <div className="card">
        <h2>Keyword Rankings</h2>
        <p>No keyword data available. <button onClick={triggerRefresh}>Refresh Now</button></p>
      </div>
    )
  }

  const { alerts, updatedAt } = data
  const allKeywords = sanitiseKeywords(data.keywords)

  // Get unique locations for filter
  const locations = [...new Set(allKeywords.map(k => k.location || ''))].filter(Boolean)

  // Apply location filter
  const keywords = locationFilter === 'all'
    ? allKeywords
    : allKeywords.filter(k => k.location === locationFilter)

  // Recalculate stats from sanitised + filtered data
  const improving = keywords.filter(k => k.change > 0).sort((a, b) => b.change - a.change)
  const declining = keywords.filter(k => k.change < 0).sort((a, b) => a.change - b.change)
  const stable = keywords.filter(k => k.change === 0)
  const top3 = keywords.filter(k => k.rank !== null && k.rank <= 3)
  const top10 = keywords.filter(k => k.rank !== null && k.rank <= 10)

  const stats = {
    total: keywords.length,
    top3: top3.length,
    top10: top10.length,
    improving: improving.length,
    declining: declining.length
  }

  // Filter keywords for table
  let filtered = keywords
  if (filter === 'improving') filtered = improving
  if (filter === 'declining') filtered = declining
  if (filter === 'top10') filtered = top10

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Keyword Rankings</h2>
        <button onClick={triggerRefresh} disabled={loading} style={{ fontSize: '0.9rem' }}>
          {loading ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>

      {/* Location Filter */}
      {locations.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            className={locationFilter === 'all' ? 'filter-active' : 'filter-inactive'}
            onClick={() => setLocationFilter('all')}
          >
            All Markets
          </button>
          {locations.map(loc => (
            <button
              key={loc}
              className={locationFilter === loc ? 'filter-active' : 'filter-inactive'}
              onClick={() => setLocationFilter(loc)}
            >
              {locationLabel(loc)}
            </button>
          ))}
        </div>
      )}

      {/* Stats Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Keywords</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#10b981' }}>{stats.top3}</div>
          <div className="stat-label">Top 3</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#3b82f6' }}>{stats.top10}</div>
          <div className="stat-label">Top 10</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#10b981' }}>{stats.improving}</div>
          <div className="stat-label">Improving</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#ef4444' }}>{stats.declining}</div>
          <div className="stat-label">Declining</div>
        </div>
      </div>

      {/* Improving & Declining keyword lists side by side */}
      {(improving.length > 0 || declining.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Improving */}
          <div style={{ padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.1rem' }}>▲</span> Improving ({improving.length})
            </h3>
            {improving.length === 0 ? (
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>No keywords improving today</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {improving.map(kw => (
                  <div key={kw.id || kw.keyword} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: '500', color: '#1f2937' }}>
                      {kw.keyword}
                      {locations.length > 1 && <span style={{ fontSize: '0.7rem', color: '#6b7280', marginLeft: '0.3rem' }}>({locationLabel(kw.location)})</span>}
                    </span>
                    <span style={{ color: '#16a34a', fontWeight: '600', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                      +{kw.change} → #{kw.rank}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Declining */}
          <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.1rem' }}>▼</span> Declining ({declining.length})
            </h3>
            {declining.length === 0 ? (
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>No keywords declining today</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {declining.map(kw => (
                  <div key={kw.id || kw.keyword} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: '500', color: '#1f2937' }}>
                      {kw.keyword}
                      {locations.length > 1 && <span style={{ fontSize: '0.7rem', color: '#6b7280', marginLeft: '0.3rem' }}>({locationLabel(kw.location)})</span>}
                    </span>
                    <span style={{ color: '#dc2626', fontWeight: '600', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                      {kw.change} → #{kw.rank}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#991b1b' }}>Alerts ({alerts.length})</h3>
          {alerts.slice(0, 5).map((alert, i) => (
            <div key={i} style={{ padding: '0.5rem 0', borderBottom: i < 4 ? '1px solid #fecaca' : 'none' }}>
              <strong>{alert.keyword}</strong>: {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { key: 'all', label: `All (${keywords.length})` },
          { key: 'top10', label: `Top 10 (${stats.top10})` },
          { key: 'improving', label: `Improving (${stats.improving})` },
          { key: 'declining', label: `Declining (${stats.declining})` }
        ].map(tab => (
          <button
            key={tab.key}
            className={filter === tab.key ? 'filter-active' : 'filter-inactive'}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Keywords Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.75rem' }}>Keyword</th>
              <th style={{ textAlign: 'center', padding: '0.75rem' }}>Market</th>
              <th style={{ textAlign: 'center', padding: '0.75rem' }}>Rank</th>
              <th style={{ textAlign: 'center', padding: '0.75rem' }}>Change</th>
              <th style={{ textAlign: 'center', padding: '0.75rem' }}>Volume</th>
              <th style={{ textAlign: 'center', padding: '0.75rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map(kw => (
              <tr key={kw.id || kw.keyword} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.75rem' }}>
                  <div style={{ fontWeight: '500' }}>{kw.keyword}</div>
                  {kw.tags && kw.tags.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {kw.tags.join(', ')}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    background: kw.location === 'google.co.nz' ? '#e0f2fe' : '#f0fdf4',
                    color: kw.location === 'google.co.nz' ? '#0369a1' : '#166534'
                  }}>
                    {locationLabel(kw.location)}
                  </span>
                </td>
                <td style={{ textAlign: 'center', padding: '0.75rem', fontWeight: '600', fontSize: '1.1rem' }}>
                  {kw.rank !== null ? `#${kw.rank}` : '—'}
                </td>
                <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                  {kw.change === 0 ? '—' : (
                    <span style={{ color: kw.change > 0 ? '#10b981' : '#ef4444', fontWeight: '500' }}>
                      {kw.change > 0 ? '▲' : '▼'} {Math.abs(kw.change)}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center', padding: '0.75rem', color: '#6b7280' }}>
                  {kw.volume !== null ? kw.volume.toLocaleString() : '—'}
                </td>
                <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                  <span className={`status-badge status-${kw.status.toLowerCase()}`}>
                    {kw.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280', textAlign: 'right' }}>
        Last updated: {new Date(updatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST
      </div>
    </div>
  )
}
