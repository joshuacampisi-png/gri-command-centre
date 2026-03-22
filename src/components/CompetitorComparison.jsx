/**
 * Competitor Comparison Dashboard Component
 * Head-to-head keyword rankings: GRI vs competitors
 */

import { useState, useEffect } from 'react'

export default function CompetitorComparison() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedKeyword, setSelectedKeyword] = useState(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10 * 60 * 1000) // refresh every 10 min
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const res = await fetch('/api/competitors/status')
      const json = await res.json()
      setData(json)
      setLoading(false)
    } catch (err) {
      console.error('Failed to load competitor data:', err)
      setLoading(false)
    }
  }

  async function triggerScan() {
    if (!confirm('This will scan Google for 40+ keywords. Takes ~5 minutes. Continue?')) return
    setLoading(true)
    try {
      await fetch('/api/competitors/scan', { method: 'POST' })
      await loadData()
    } catch (err) {
      console.error('Scan failed:', err)
      setLoading(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="card">
        <h2>🔍 Competitor Analysis</h2>
        <p>Loading competitor data...</p>
      </div>
    )
  }

  if (!data || !data.keywords) {
    return (
      <div className="card">
        <h2>🔍 Competitor Analysis</h2>
        <p>No competitor data yet. <button onClick={triggerScan}>Run First Scan</button></p>
      </div>
    )
  }

  const { keywords, summary, competitors, updatedAt } = data

  // Calculate dominance metrics
  const dominance = {}
  for (const key of Object.keys(competitors)) {
    const wins = keywords.filter(k => {
      const griRank = k.positions.gri?.rank
      const compRank = k.positions[key]?.rank
      return griRank && compRank && griRank < compRank
    }).length
    
    const losses = keywords.filter(k => {
      const griRank = k.positions.gri?.rank
      const compRank = k.positions[key]?.rank
      return griRank && compRank && compRank < griRank
    }).length

    dominance[key] = { wins, losses, total: wins + losses }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>🔍 Competitor Analysis</h2>
        <button onClick={triggerScan} disabled={loading} style={{ fontSize: '0.9rem' }}>
          {loading ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      {/* Competitor Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {Object.entries(competitors).map(([key, comp]) => {
          const stats = summary[key]
          const dom = dominance[key]
          const winRate = dom.total > 0 ? Math.round((dom.wins / dom.total) * 100) : 0

          return (
            <div
              key={key}
              style={{
                padding: '1rem',
                border: `2px solid ${comp.color}`,
                borderRadius: '8px',
                background: key === 'gri' ? '#f0fdf4' : '#fff'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: comp.color,
                    marginRight: '0.5rem'
                  }}
                />
                <strong>{comp.name}</strong>
              </div>
              
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                {comp.domain}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#10b981' }}>{stats.top3}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Top 3</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#3b82f6' }}>{stats.top10}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Top 10</div>
                </div>
              </div>

              {key !== 'gri' && (
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    <strong>vs GRI:</strong> {winRate}% win rate
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    You beat them: {dom.wins} | They beat you: {dom.losses}
                  </div>
                </div>
              )}

              {stats.avgRank && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                  Avg rank: #{stats.avgRank}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Head-to-Head Table */}
      <h3 style={{ marginBottom: '1rem' }}>Head-to-Head Rankings</h3>
      
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.75rem' }}>Keyword</th>
              {Object.entries(competitors).map(([key, comp]) => (
                <th key={key} style={{ textAlign: 'center', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: comp.color
                      }}
                    />
                    {comp.name.split(' ')[0]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keywords.slice(0, 30).map((kw, i) => {
              const griRank = kw.positions.gri?.rank
              const bestRank = Math.min(
                ...Object.keys(competitors)
                  .map(k => kw.positions[k]?.rank)
                  .filter(r => r !== null && r !== undefined)
              )

              return (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem', maxWidth: '200px' }}>
                    <div style={{ fontWeight: '500', fontSize: '0.875rem' }}>{kw.keyword}</div>
                  </td>
                  {Object.keys(competitors).map(key => {
                    const rank = kw.positions[key]?.rank
                    const isBest = rank === bestRank
                    const isGRI = key === 'gri'

                    return (
                      <td
                        key={key}
                        style={{
                          textAlign: 'center',
                          padding: '0.75rem',
                          fontWeight: isBest ? '700' : '500',
                          background: isBest && isGRI ? '#d1fae5' : isBest ? '#fee2e2' : 'transparent',
                          color: rank === null ? '#9ca3af' : '#1f2937'
                        }}
                      >
                        {rank !== null ? `#${rank}` : '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280', textAlign: 'right' }}>
        Last scanned: {new Date(updatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST
      </div>
    </div>
  )
}
