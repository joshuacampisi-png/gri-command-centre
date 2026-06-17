/**
 * Blog Approval Component
 * Shows pending blog drafts generated from rank drops
 * One-click approve → publish to Shopify
 */

import { useState, useEffect } from 'react'

export default function BlogApproval() {
  const [drops, setDrops] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDrop, setSelectedDrop] = useState(null)

  useEffect(() => {
    loadDrops()
    const interval = setInterval(loadDrops, 2 * 60 * 1000) // refresh every 2 min
    return () => clearInterval(interval)
  }, [])

  async function loadDrops() {
    try {
      const res = await fetch('/api/keywords/drops')
      const json = await res.json()
      setDrops(json.drops || [])
      setLoading(false)
    } catch (err) {
      console.error('Failed to load drops:', err)
      setLoading(false)
    }
  }

  async function regenerateArticle(dropId) {
    if (!confirm('Regenerate this blog article with fresh content?')) return
    setLoading(true)
    try {
      await fetch(`/api/keywords/drops/${dropId}/regenerate`, { method: 'POST' })
      await loadDrops()
    } catch (err) {
      alert(`Failed: ${err.message}`)
      setLoading(false)
    }
  }

  async function publishArticle(dropId) {
    if (!confirm('Publish this article to live Shopify blog?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/keywords/drops/${dropId}/publish`, { method: 'POST' })
      const json = await res.json()
      if (json.ok) {
        alert(`Published! Live at: ${json.liveUrl}`)
        await loadDrops()
      } else {
        alert(`Failed: ${json.error}`)
      }
    } catch (err) {
      alert(`Failed: ${err.message}`)
      setLoading(false)
    }
  }

  async function deleteDrop(dropId) {
    if (!confirm('Delete this blog draft? This cannot be undone.')) return
    setLoading(true)
    try {
      await fetch(`/api/keywords/drops/${dropId}`, { method: 'DELETE' })
      await loadDrops()
    } catch (err) {
      alert(`Failed: ${err.message}`)
      setLoading(false)
    }
  }

  const pending = drops.filter(d => ['draft', 'generated'].includes(d.status))
  const published = drops.filter(d => d.status === 'published')
  const failed = drops.filter(d => d.status === 'failed')

  if (loading && drops.length === 0) {
    return (
      <div className="card">
        <h2>📝 Blog Approval Queue</h2>
        <p>Loading pending articles...</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>📝 Blog Approval Queue</h2>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <div className="stat-value">{pending.length}</div>
          <div className="stat-label">Pending Approval</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{published.length}</div>
          <div className="stat-label">Published</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--red)' }}>{failed.length}</div>
          <div className="stat-label">Failed</div>
        </div>
      </div>

      {/* Pending Articles */}
      {pending.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-canvas)', borderRadius: 'var(--radius)' }}>
          <p style={{ margin: 0 }}>No articles awaiting approval</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>New articles appear here when keywords drop in rankings</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {pending.map(drop => (
            <div
              key={drop.id}
              style={{
                padding: '1.5rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-surface)'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>
                    {drop.article?.title || drop.keyword}
                  </h3>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    <span>Keyword: <strong>{drop.keyword}</strong></span>
                    <span>Dropped: <strong style={{ color: 'var(--red)' }}>#{drop.previousRank} → #{drop.currentRank}</strong> (-{drop.drop})</span>
                    <span>Volume: <strong>{drop.volume?.toLocaleString() || '—'}</strong></span>
                  </div>
                </div>
                <span
                  className={`status-badge status-${drop.status}`}
                  style={{ flexShrink: 0 }}
                >
                  {drop.status}
                </span>
              </div>

              {/* Article Preview */}
              {drop.article && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <strong>Meta Description:</strong>
                    <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)' }}>{drop.article.metaDescription}</div>
                  </div>
                  <div>
                    <strong>Content Preview:</strong>
                    <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)', maxHeight: '100px', overflow: 'hidden' }}>
                      {drop.article.content.substring(0, 300)}...
                    </div>
                  </div>
                  {drop.article.tags && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <strong>Tags:</strong> {drop.article.tags.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Shopify Link */}
              {drop.shopify?.adminUrl && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--blue-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
                  <strong>Shopify Draft:</strong>{' '}
                  <a href={drop.shopify.adminUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>
                    View in Shopify Admin →
                  </a>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setSelectedDrop(selectedDrop?.id === drop.id ? null : drop)}
                  style={{ flex: 1, background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  {selectedDrop?.id === drop.id ? 'Hide Preview' : 'Show Full Preview'}
                </button>
                <button
                  onClick={() => regenerateArticle(drop.id)}
                  disabled={loading}
                  style={{ flex: 1, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--border)' }}
                >
                  Regenerate
                </button>
                <button
                  onClick={() => publishArticle(drop.id)}
                  disabled={loading}
                  style={{ flex: 1, background: 'var(--text)', color: 'var(--bg-surface)' }}
                >
                  ✓ Publish to Live
                </button>
                <button
                  onClick={() => deleteDrop(drop.id)}
                  disabled={loading}
                  style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--border)' }}
                >
                  Delete
                </button>
              </div>

              {/* Full Preview */}
              {selectedDrop?.id === drop.id && drop.article && (
                <div style={{ marginTop: '1rem', padding: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)' }}>
                  <h4 style={{ marginTop: 0 }}>{drop.article.title}</h4>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    {drop.article.metaDescription}
                  </div>
                  <div
                    style={{ lineHeight: '1.6', whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{ __html: drop.article.content.replace(/\n/g, '<br/>') }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Published Articles (collapsed) */}
      {published.length > 0 && (
        <details style={{ marginTop: '1.5rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: '600', padding: '0.5rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)' }}>
            Published Articles ({published.length})
          </summary>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {published.map(drop => (
              <div key={drop.id} style={{ padding: '0.75rem', background: 'var(--green-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{drop.article?.title || drop.keyword}</strong>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Published: {new Date(drop.completedAt).toLocaleDateString('en-AU')}
                    </div>
                  </div>
                  {drop.shopify?.handle && (
                    <a
                      href={`https://genderrevealideas.com.au/blogs/news/${drop.shopify.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.875rem', color: 'var(--blue)' }}
                    >
                      View Live →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
