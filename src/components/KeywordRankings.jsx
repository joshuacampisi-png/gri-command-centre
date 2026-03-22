/**
 * Keyword Rankings Dashboard Component
 * Shows current keyword positions, rank changes, alerts
 */

import { useState, useEffect } from 'react'

export default function KeywordRankings() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all | critical | improving | declining

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5 * 60 * 1000) // refresh every 5 min
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
        <h2>📊 Keyword Rankings</h2>
        <p>Loading keyword data...</p>
      </div>
    )
  }

  if (!data || !data.keywords) {
    return (
      <div className="card">
        <h2>📊 Keyword Rankings</h2>
        <p>No keyword data available. <button onClick={triggerRefresh}>Refresh Now</button></p>
      </div>
    )
  }

  const { keywords, stats, alerts, updatedAt } = data

  // Filter keywords
  let filtered = keywords
  if (filter === 'critical') filtered = keywords.filter(k => k.status === 'CRITICAL')
  if (filter === 'improving') filtered = keywords.filter(k => k.status === 'IMPROVING')
  if (filter === 'declining') filtered = keywords.filter(k => k.change < 0)

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>📊 Keyword Rankings</h2>
        <button onClick={triggerRefresh} disabled={loading} style={{ fontSize: '0.9rem' }}>
          {loading ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>

      {/* Stats Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
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
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#ef4444' }}>{stats.critical}</div>
          <div className="stat-label">Critical Alerts</div>
        </div>
      </div>

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#991b1b' }}>⚠️ Alerts ({alerts.length})</h3>
          {alerts.slice(0, 5).map((alert, i) => (
            <div key={i} style={{ padding: '0.5rem 0', borderBottom: i < 4 ? '1px solid #fecaca' : 'none' }}>
              <strong>{alert.keyword}</strong>: {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          className={filter === 'all' ? 'filter-active' : 'filter-inactive'}
          onClick={() => setFilter('all')}
        >
          All ({keywords.length})
        </button>
        <button
          className={filter === 'critical' ? 'filter-active' : 'filter-inactive'}
          onClick={() => setFilter('critical')}
        >
          Critical ({keywords.filter(k => k.status === 'CRITICAL').length})
        </button>
        <button
          className={filter === 'improving' ? 'filter-active' : 'filter-inactive'}
          onClick={() => setFilter('improving')}
        >
          Improving ({keywords.filter(k => k.status === 'IMPROVING').length})
        </button>
        <button
          className={filter === 'declining' ? 'filter-active' : 'filter-inactive'}
          onClick={() => setFilter('declining')}
        >
          Declining ({keywords.filter(k => k.change < 0).length})
        </button>
      </div>

      {/* Keywords Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.75rem' }}>Keyword</th>
              <th style={{ textAlign: 'center', padding: '0.75rem' }}>Rank</th>
              <th style={{ textAlign: 'center', padding: '0.75rem' }}>Change</th>
              <th style={{ textAlign: 'center', padding: '0.75rem' }}>Volume</th>
              <th style={{ textAlign: 'center', padding: '0.75rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map(kw => (
              <tr key={kw.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.75rem' }}>
                  <div style={{ fontWeight: '500' }}>{kw.keyword}</div>
                  {kw.tags && kw.tags.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {kw.tags.join(', ')}
                    </div>
                  )}
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
