import { useState, useEffect, useCallback } from 'react'
import { parseBlogContent, assembleFinalOutput, countImages, PLACEMENTS } from '../lib/blog-parser'

const ARTICLE_TYPES = [
  { value: 'informational',  label: 'Informational / How-To',  words: '1,800–2,500' },
  { value: 'listicle',       label: 'Listicle / Roundup',      words: '1,500–2,200' },
  { value: 'buying_guide',   label: 'Product / Buying Guide',  words: '2,000–3,000' },
  { value: 'comparison',     label: 'Comparison',              words: '1,800–2,500' },
  { value: 'local_seasonal', label: 'Local / Seasonal',        words: '1,200–1,800' },
  { value: 'pillar',         label: 'Pillar / Cornerstone',    words: '3,000–5,000' },
]

const CHECKLIST_LABELS = {
  kwInH1:           'Primary KW in H1',
  kwInMetaTitle:    'Primary KW in meta title',
  kwInMetaDesc:     'Primary KW in meta description',
  kwInSlug:         'Primary KW in URL slug',
  kwIn2PlusH2s:     'Primary KW in 2+ H2 headings',
  metaTitleLength:  'Meta title 55–60 chars',
  metaDescLength:   'Meta description ≤160 chars',
  minH2Sections:    'Minimum 4 H2 sections',
  faqPresent:       'FAQ section present',
  internalLinksMin3:'3+ internal links',
  snippetOptimised: 'Featured snippet section',
  wordCountOk:      'Word count on target',
}

const PLACEMENT_LABELS = {
  'hero':     'Hero image',
  'inline-1': 'Inline image 1',
  'inline-2': 'Inline image 2',
  'inline-3': 'Inline image 3',
}

const DOT_COLORS = {
  pending:    '#555',
  generating: '#f5a623',
  reviewing:  '#a78bfa',
  done:       '#34d399',
  failed:     '#ef4444',
}

// ── Sub-components ────────────────────────────────────────────

function SerpPreview({ article }) {
  if (!article) return null
  return (
    <div className="bw-serp">
      <div className="bw-serp-label">SERP Preview</div>
      <div className="bw-serp-card">
        <div className="bw-serp-url">genderrevealideas.com.au › blog › {article.slug}</div>
        <div className="bw-serp-title">{article.metaTitle}</div>
        <div className="bw-serp-desc">{article.metaDescription}</div>
      </div>
    </div>
  )
}

function SeoChecklist({ article }) {
  if (!article?.seoChecklist) return null
  const { seoChecklist, checklistScore, checklistTotal } = article
  const pct = Math.round((checklistScore / checklistTotal) * 100)
  return (
    <div className="bw-checklist">
      <div className="bw-checklist-header">
        <span>SEO Checklist</span>
        <span className={`bw-checklist-score ${pct === 100 ? 'perfect' : pct >= 75 ? 'good' : 'warn'}`}>
          {checklistScore}/{checklistTotal} ({pct}%)
        </span>
      </div>
      <div className="bw-checklist-grid">
        {Object.entries(seoChecklist).map(([key, pass]) => (
          <div key={key} className={`bw-check-item ${pass ? 'pass' : 'fail'}`}>
            <span className="bw-check-icon">{pass ? '✅' : '❌'}</span>
            <span>{CHECKLIST_LABELS[key] || key}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetaBlock({ article }) {
  if (!article) return null
  return (
    <div className="bw-meta-block">
      {[
        ['Title', article.title],
        ['SEO Title', <>{article.metaTitle} <span className="bw-char-count">({article.metaTitle?.length} chars)</span></>],
        ['Meta Desc', <>{article.metaDescription} <span className="bw-char-count">({article.metaDescription?.length} chars)</span></>],
        ['Slug', <code>/blog/{article.slug}</code>],
        ['Tags', (article.tags || []).join(', ')],
        ['Words', `${article.wordCount?.toLocaleString()} words`],
        ['KW Density', `${article.kwDensity}% (${article.kwOccurrences} occurrences)`],
        ['H2 Sections', article.h2Count],
        ['Internal Links', article.internalLinks],
        ['Secondary KWs', (article.secondaryKeywords || []).join(', ') || 'N/A'],
      ].map(([label, value], i) => (
        <div key={i} className="bw-meta-row">
          <span className="bw-meta-label">{label}</span>
          <span className="bw-meta-value">{value}</span>
        </div>
      ))}
    </div>
  )
}

function ImagePairRow({ label, pair, onRegenerate, regenerating }) {
  const getOverall = () => {
    const d = pair.desktop.status
    const m = pair.mobile.status
    if (d === 'generating' || m === 'generating') return 'generating'
    if (d === 'done' && m === 'done') return 'done'
    if (d === 'failed' || m === 'failed') return 'failed'
    return 'pending'
  }

  const variantChip = (variant) => {
    const s = pair[variant]
    const isRegen = regenerating === variant || regenerating === 'both'
    const canRegen = s.status === 'done' || s.status === 'failed' || s.status === 'pending'
    const isActive = s.status === 'generating' || s.status === 'reviewing'
    return (
      <span className="bw-img-variant">
        {variant}
        {s.status === 'done' && s.url && (
          <>
            {s.qaScore > 0 && (
              <span className={`bw-qa-score ${s.qaScore >= 8 ? 'high' : s.qaScore >= 6 ? 'mid' : 'low'}`}
                title={s.qaIssues?.join(', ') || 'No issues'}>
                {s.qaScore}/10
              </span>
            )}
            <a href={s.url} target="_blank" rel="noreferrer" className="bw-img-view">view</a>
          </>
        )}
        {(s.status === 'failed' || s.status === 'pending') && (
          <span className="bw-img-status" style={{ color: DOT_COLORS[s.status] }}>
            {s.status}
          </span>
        )}
        {isActive && (
          <span className="bw-img-status" style={{ color: DOT_COLORS[s.status] }}>
            {s.status === 'reviewing' ? 'QA review' : s.status}
          </span>
        )}
        {canRegen && !isActive && (
          <button
            className="bw-img-regen-btn"
            onClick={() => onRegenerate(variant)}
            disabled={isRegen}
            title={`Regenerate ${variant}`}
          >↻</button>
        )}
      </span>
    )
  }

  const overall = getOverall()
  const canRegenBoth = (pair.desktop.status === 'done' || pair.desktop.status === 'failed') &&
                        (pair.mobile.status === 'done' || pair.mobile.status === 'failed')

  const refCount = (pair.desktop.referenceImages?.length || 0)

  return (
    <div className="bw-img-row">
      <span className="bw-img-dot" style={{ background: DOT_COLORS[overall] }} />
      <span className="bw-img-label">
        {label}
        {refCount > 0 && <span className="bw-img-ref-count">Using {refCount} reference images</span>}
      </span>
      <div className="bw-img-variants">
        {variantChip('desktop')}
        <span className="bw-img-sep">·</span>
        {variantChip('mobile')}
        {canRegenBoth && (
          <button
            className="bw-img-regen-pair"
            onClick={() => onRegenerate('both')}
            disabled={!!regenerating}
            title="Regenerate both"
          >↻ pair</button>
        )}
      </div>
    </div>
  )
}

function ImagePanel({ imagePairs, imageProgress, phase, onRegenerate, onRegenAll, regeneratingMap, regenAllRunning }) {
  const availablePlacements = PLACEMENTS.filter(p => imagePairs[p])
  if (availablePlacements.length === 0) return null

  const pct = imageProgress.total > 0
    ? Math.round((imageProgress.done / imageProgress.total) * 100)
    : 0

  const allDone = availablePlacements.every(p =>
    imagePairs[p].desktop.status === 'done' && imagePairs[p].mobile.status === 'done'
  )

  return (
    <div className="bw-images-panel">
      <div className="bw-images-header">
        <span className="bw-images-title">Images</span>
        <span className="bw-images-count">
          Nano Banana Pro — {imageProgress.done}/{imageProgress.total} generated
        </span>
        {phase === 'generating-images' && (
          <div className="bw-images-progress">
            <div className="bw-images-progress-bar" style={{ width: `${pct}%` }} />
          </div>
        )}
        {phase === 'complete' && (
          <button
            className="btn-outline bw-regen-all-btn"
            onClick={onRegenAll}
            disabled={regenAllRunning}
          >
            {regenAllRunning ? '↻ Regenerating…' : '↻ Regenerate All Images'}
          </button>
        )}
      </div>
      <div className="bw-images-list">
        {availablePlacements.map(p => (
          <ImagePairRow
            key={p}
            label={PLACEMENT_LABELS[p]}
            pair={imagePairs[p]}
            onRegenerate={(variant) => onRegenerate(p, variant)}
            regenerating={regeneratingMap[p] || null}
          />
        ))}
      </div>
    </div>
  )
}

// ── Image Selection Gallery ──────────────────────────────────
// Shows generated images as visual thumbnails with checkboxes.
// User selects which images to include, clicks Apply.

function FeedbackModal({ imageKey, onSubmit, onClose }) {
  const [comment, setComment] = useState('')
  return (
    <div className="bw-feedback-overlay" onClick={onClose}>
      <div className="bw-feedback-modal" onClick={e => e.stopPropagation()}>
        <div className="bw-feedback-modal-header">
          <span>What's wrong with this image?</span>
          <button className="bw-feedback-close" onClick={onClose}>×</button>
        </div>
        <textarea
          className="bw-feedback-textarea"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="e.g. Product doesn't look like ours, wrong colour, too dark, background is indoor..."
          autoFocus
        />
        <div className="bw-feedback-modal-actions">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => { onSubmit(imageKey, comment); onClose() }}
            disabled={!comment.trim()}
          >
            Submit Feedback
          </button>
        </div>
      </div>
    </div>
  )
}

function ImageSelectionGallery({ imagePairs, selectedImages, onToggle, onApply, onSelectAll, onDeselectAll, onDeleteImage, onFeedback, feedbackMap }) {
  const availablePlacements = PLACEMENTS.filter(p => imagePairs[p])
  if (availablePlacements.length === 0) return null

  const hasAnyDone = availablePlacements.some(p =>
    imagePairs[p].desktop.status === 'done' || imagePairs[p].mobile.status === 'done'
  )
  if (!hasAnyDone) return null

  const totalSelected = Object.values(selectedImages).filter(Boolean).length
  const totalAvailable = availablePlacements.reduce((n, p) => {
    if (imagePairs[p].desktop.status === 'done' && imagePairs[p].desktop.url) n++
    if (imagePairs[p].mobile.status === 'done' && imagePairs[p].mobile.url) n++
    return n
  }, 0)

  return (
    <div className="bw-gallery">
      <div className="bw-gallery-header">
        <span className="bw-gallery-title">Select Images for Article</span>
        <span className="bw-gallery-count">{totalSelected}/{totalAvailable} selected</span>
        <div className="bw-gallery-actions">
          <button className="btn-outline bw-gallery-btn" onClick={onSelectAll}>Select All</button>
          <button className="btn-outline bw-gallery-btn" onClick={onDeselectAll}>Deselect All</button>
          <button
            className="btn-primary bw-gallery-apply"
            onClick={onApply}
            disabled={totalSelected === 0}
          >
            Apply {totalSelected > 0 ? `(${totalSelected})` : ''} Images
          </button>
        </div>
      </div>
      <div className="bw-gallery-grid">
        {availablePlacements.map(placement => {
          const pair = imagePairs[placement]
          return ['desktop', 'mobile'].map(variant => {
            const img = pair[variant]
            if (img.status !== 'done' || !img.url) return null

            const key = `${placement}-${variant}`
            const isSelected = !!selectedImages[key]

            return (
              <div
                key={key}
                className={`bw-gallery-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onToggle(key)}
              >
                <div className="bw-gallery-checkbox">
                  {isSelected ? '✓' : ''}
                </div>
                <button
                  className="bw-gallery-delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteImage(placement, variant) }}
                  title="Remove this image"
                >×</button>
                <img
                  src={img.url}
                  alt={pair.alt}
                  className="bw-gallery-thumb"
                />
                <div className="bw-gallery-meta">
                  <span className="bw-gallery-placement">{PLACEMENT_LABELS[placement]}</span>
                  <span className="bw-gallery-variant">{variant}</span>
                  {img.qaScore > 0 && (
                    <span className={`bw-qa-score ${img.qaScore >= 8 ? 'high' : img.qaScore >= 6 ? 'mid' : 'low'}`}>
                      {img.qaScore}/10
                    </span>
                  )}
                </div>
                <div className="bw-gallery-feedback" onClick={e => e.stopPropagation()}>
                  <button
                    className={`bw-fb-btn bw-fb-up ${feedbackMap?.[key]?.rating === 'good' ? 'active' : ''}`}
                    onClick={() => onFeedback(key, 'good', placement, variant, img)}
                    title="Good image"
                  >👍</button>
                  <button
                    className={`bw-fb-btn bw-fb-down ${feedbackMap?.[key]?.rating === 'bad' ? 'active' : ''}`}
                    onClick={() => onFeedback(key, 'bad', placement, variant, img)}
                    title="Bad image — leave feedback"
                  >👎</button>
                </div>
              </div>
            )
          })
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export default function BlogWriterTab() {
  const [keyword, setKeyword] = useState('')
  const [articleType, setArticleType] = useState('informational')
  const [phase, setPhase] = useState('idle') // idle | researching | writing | generating-images | complete | error
  const [article, setArticle] = useState(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [history, setHistory] = useState([])
  const [copied, setCopied] = useState(false)
  const [hasFal, setHasFal] = useState(false)
  const [deleting, setDeleting] = useState(null)

  // Image feedback state
  const [feedbackMap, setFeedbackMap] = useState({}) // { 'hero-desktop': { rating: 'good'|'bad', comment: '' } }
  const [feedbackModalKey, setFeedbackModalKey] = useState(null) // key of image awaiting comment

  // Scrape state (Stage 1)
  const [scrapeStatus, setScrapeStatus] = useState({ brand: 'pending', web: 'pending' })
  const [brandScrape, setBrandScrape] = useState(null)
  const [webRefs, setWebRefs] = useState(null)

  // Image pipeline state
  const [blocks, setBlocks] = useState([])
  const [imagePairs, setImagePairs] = useState({})
  const [imageProgress, setImageProgress] = useState({ done: 0, total: 0 })
  const [finalOutput, setFinalOutput] = useState('')
  const [regeneratingMap, setRegeneratingMap] = useState({})
  const [regenAllRunning, setRegenAllRunning] = useState(false)

  // Image selection state
  const [selectedImages, setSelectedImages] = useState({}) // { 'hero-desktop': true, 'inline-1-mobile': true, ... }
  const [imagesApplied, setImagesApplied] = useState(false)

  // Save session to backend (called at key milestones)
  const saveSession = useCallback((overrides = {}) => {
    const state = {
      phase: overrides.phase ?? phase,
      keyword: overrides.keyword ?? keyword,
      articleType: overrides.articleType ?? articleType,
      article: overrides.article ?? article,
      blocks: overrides.blocks ?? blocks,
      imagePairs: overrides.imagePairs ?? imagePairs,
      imageProgress: overrides.imageProgress ?? imageProgress,
      finalOutput: overrides.finalOutput ?? finalOutput,
      selectedImages: overrides.selectedImages ?? selectedImages,
      imagesApplied: overrides.imagesApplied ?? imagesApplied,
    }
    // Fire and forget — don't block the UI
    fetch('/api/blog-writer/session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => {})
  }, [phase, keyword, articleType, article, blocks, imagePairs, imageProgress, finalOutput, selectedImages, imagesApplied])

  const clearSession = useCallback(() => {
    fetch('/api/blog-writer/session', { method: 'DELETE' }).catch(() => {})
  }, [])

  // Load history, config, and restore session on mount
  useEffect(() => {
    fetch('/api/blog-writer/history')
      .then(r => r.json())
      .then(d => { if (d.ok) setHistory(d.history || []) })
      .catch(() => {})
    fetch('/api/blog-writer/image-config')
      .then(r => r.json())
      .then(d => { if (d.ok) setHasFal(d.hasFal) })
      .catch(() => {})

    // Restore session if one exists
    fetch('/api/blog-writer/session')
      .then(r => r.json())
      .then(d => {
        if (!d.ok || !d.session || !d.session.phase) return
        const s = d.session
        // Restore any meaningful state — article, images, or in-progress
        if (s.phase === 'complete' || s.phase === 'generating-images' || s.phase === 'writing' || s.phase === 'researching') {
          if (s.keyword) setKeyword(s.keyword)
          if (s.articleType) setArticleType(s.articleType)
          if (s.article) setArticle(s.article)
          if (s.blocks) setBlocks(s.blocks)
          if (s.imagePairs) setImagePairs(s.imagePairs)
          if (s.imageProgress) setImageProgress(s.imageProgress)
          if (s.finalOutput) setFinalOutput(s.finalOutput)
          if (s.selectedImages) setSelectedImages(s.selectedImages)
          if (s.imagesApplied) setImagesApplied(s.imagesApplied)
          // Restore as complete — if something was mid-generation, show what was done
          setPhase(s.article ? 'complete' : 'idle')
        }
      })
      .catch(() => {})
  }, [])

  // Auto-select all images when generation completes
  useEffect(() => {
    if (phase === 'complete' && Object.keys(imagePairs).length > 0) {
      const sel = {}
      for (const p of PLACEMENTS) {
        if (!imagePairs[p]) continue
        if (imagePairs[p].desktop.status === 'done' && imagePairs[p].desktop.url) sel[`${p}-desktop`] = true
        if (imagePairs[p].mobile.status === 'done' && imagePairs[p].mobile.url) sel[`${p}-mobile`] = true
      }
      setSelectedImages(sel)
      setImagesApplied(false)
    }
  }, [phase, imagePairs])

  const generateSingleImage = useCallback(async (prompt, aspectRatio, referenceImageUrls) => {
    const res = await fetch('/api/blog-writer/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, aspectRatio, referenceImageUrls, keyword: keyword.trim() }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Image generation failed')
    return data.imageUrl
  }, [keyword])

  // Vision QA: Claude reviews the generated image against prompt + brand standards
  const reviewImage = useCallback(async (imageUrl, prompt, placement, alt) => {
    try {
      const res = await fetch('/api/blog-writer/review-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, prompt, placement, alt }),
      })
      const data = await res.json()
      if (!data.ok) return { score: 0, pass: true, issues: ['QA unavailable'] }
      return data.review
    } catch {
      return { score: 0, pass: true, issues: ['QA unavailable'] }
    }
  }, [])

  // Image feedback handlers
  const handleImageFeedback = useCallback((key, rating, placement, variant, img) => {
    if (rating === 'bad') {
      // Open comment modal
      setFeedbackModalKey(key)
      setFeedbackMap(prev => ({ ...prev, [key]: { rating: 'bad', comment: '', placement, variant, prompt: img.prompt, url: img.url } }))
    } else {
      // Thumbs up — save immediately
      setFeedbackMap(prev => ({ ...prev, [key]: { rating: 'good', comment: '', placement, variant, prompt: img.prompt, url: img.url } }))
      fetch('/api/blog-writer/image-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 'good', comment: '', placement, variant, prompt: img.prompt, imageUrl: img.url, keyword }),
      }).catch(() => {})
    }
  }, [keyword])

  const handleFeedbackComment = useCallback((key, comment) => {
    const fb = feedbackMap[key] || {}
    setFeedbackMap(prev => ({
      ...prev,
      [key]: { ...prev[key], rating: 'bad', comment },
    }))

    // Send feedback to backend
    fetch('/api/blog-writer/image-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 'bad', comment, placement: fb.placement, variant: fb.variant, prompt: fb.prompt, imageUrl: fb.url, keyword }),
    }).catch(() => {})

    // Remove the image from the gallery and blog output
    const placement = fb.placement
    const variant = fb.variant
    if (placement && variant) {
      setImagePairs(prev => {
        const updated = {
          ...prev,
          [placement]: {
            ...prev[placement],
            [variant]: { ...prev[placement][variant], url: undefined, status: 'pending', qaScore: undefined, qaIssues: undefined },
          },
        }
        const output = assembleFinalOutput(blocks, updated)
        setFinalOutput(output)
        return updated
      })
      setSelectedImages(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setImagesApplied(false)
    }
  }, [feedbackMap, keyword, blocks])

  // Image selection handlers
  const handleToggleImage = useCallback((key) => {
    setSelectedImages(prev => ({ ...prev, [key]: !prev[key] }))
    setImagesApplied(false)
  }, [])

  const handleSelectAll = useCallback(() => {
    const sel = {}
    for (const p of PLACEMENTS) {
      if (!imagePairs[p]) continue
      if (imagePairs[p].desktop.status === 'done' && imagePairs[p].desktop.url) sel[`${p}-desktop`] = true
      if (imagePairs[p].mobile.status === 'done' && imagePairs[p].mobile.url) sel[`${p}-mobile`] = true
    }
    setSelectedImages(sel)
    setImagesApplied(false)
  }, [imagePairs])

  const handleDeselectAll = useCallback(() => {
    setSelectedImages({})
    setImagesApplied(false)
  }, [])

  // Delete a single generated image (clear its URL, reset to pending)
  const handleDeleteImage = useCallback((placement, variant) => {
    setImagePairs(prev => {
      const updated = {
        ...prev,
        [placement]: {
          ...prev[placement],
          [variant]: { ...prev[placement][variant], url: undefined, status: 'pending', qaScore: undefined, qaIssues: undefined },
        },
      }
      // Instantly reassemble the blog output without this image
      const output = assembleFinalOutput(blocks, updated)
      setFinalOutput(output)
      return updated
    })
    setSelectedImages(prev => {
      const next = { ...prev }
      delete next[`${placement}-${variant}`]
      return next
    })
    setImagesApplied(false)
  }, [blocks])

  // Apply selected images: rebuild final output with only selected images
  const handleApplyImages = useCallback(() => {
    // Build a filtered version of imagePairs where unselected images have no URL
    const filteredPairs = {}
    for (const p of PLACEMENTS) {
      if (!imagePairs[p]) continue
      filteredPairs[p] = {
        ...imagePairs[p],
        desktop: {
          ...imagePairs[p].desktop,
          url: selectedImages[`${p}-desktop`] ? imagePairs[p].desktop.url : undefined,
        },
        mobile: {
          ...imagePairs[p].mobile,
          url: selectedImages[`${p}-mobile`] ? imagePairs[p].mobile.url : undefined,
        },
      }
    }

    const output = assembleFinalOutput(blocks, filteredPairs)
    setFinalOutput(output)
    setImagesApplied(true)
    saveSession({ finalOutput: output, selectedImages, imagesApplied: true })
  }, [imagePairs, selectedImages, blocks, saveSession])

  // Regenerate a single image variant (or both) for a placement
  const handleRegenImage = useCallback(async (placement, variant) => {
    const variants = variant === 'both' ? ['desktop', 'mobile'] : [variant]
    setRegeneratingMap(prev => ({ ...prev, [placement]: variant }))

    for (const v of variants) {
      const pair = imagePairs[placement]
      if (!pair) continue

      setImagePairs(prev => ({
        ...prev,
        [placement]: { ...prev[placement], [v]: { ...prev[placement][v], status: 'generating' } },
      }))

      try {
        const url = await generateSingleImage(pair[v].prompt, pair[v].aspectRatio)
        setImagePairs(prev => ({
          ...prev,
          [placement]: { ...prev[placement], [v]: { ...prev[placement][v], url, status: 'done' } },
        }))
      } catch (e) {
        setImagePairs(prev => ({
          ...prev,
          [placement]: { ...prev[placement], [v]: { ...prev[placement][v], status: 'failed' } },
        }))
      }
    }

    setRegeneratingMap(prev => {
      const next = { ...prev }
      delete next[placement]
      return next
    })

    setImagesApplied(false)

    // Reassemble final output with updated pairs
    setImagePairs(latest => {
      const output = assembleFinalOutput(blocks, latest)
      setFinalOutput(output)
      return latest
    })
  }, [imagePairs, blocks, generateSingleImage])

  // Regenerate all images
  const handleRegenAll = useCallback(async () => {
    setRegenAllRunning(true)
    const availablePlacements = PLACEMENTS.filter(p => imagePairs[p])

    for (const placement of availablePlacements) {
      for (const v of ['desktop', 'mobile']) {
        const pair = imagePairs[placement]
        if (!pair) continue

        setRegeneratingMap(prev => ({ ...prev, [placement]: v }))
        setImagePairs(prev => ({
          ...prev,
          [placement]: { ...prev[placement], [v]: { ...prev[placement][v], status: 'generating' } },
        }))

        try {
          const url = await generateSingleImage(pair[v].prompt, pair[v].aspectRatio)
          setImagePairs(prev => ({
            ...prev,
            [placement]: { ...prev[placement], [v]: { ...prev[placement][v], url, status: 'done' } },
          }))
        } catch (e) {
          setImagePairs(prev => ({
            ...prev,
            [placement]: { ...prev[placement], [v]: { ...prev[placement][v], status: 'failed' } },
          }))
        }

        setRegeneratingMap(prev => {
          const next = { ...prev }
          delete next[placement]
          return next
        })
      }
    }

    setImagesApplied(false)

    // Reassemble final output
    setImagePairs(latest => {
      const output = assembleFinalOutput(blocks, latest)
      setFinalOutput(output)
      return latest
    })

    setRegenAllRunning(false)
  }, [imagePairs, blocks, generateSingleImage])

  const handleGenerate = useCallback(async () => {
    if (!keyword.trim() || phase === 'writing' || phase === 'generating-images' || phase === 'researching') return

    setPhase('researching')
    setError('')
    setSuccessMsg('')
    setArticle(null)
    setBlocks([])
    setImagePairs({})
    setFinalOutput('')
    setCopied(false)
    setImageProgress({ done: 0, total: 0 })
    setSelectedImages({})
    setImagesApplied(false)
    setBrandScrape(null)
    setWebRefs(null)
    setScrapeStatus({ brand: 'pending', web: 'pending' })

    try {
      // STAGE 1: Research — scrape brand site + web references in parallel
      setScrapeStatus({ brand: 'generating', web: 'generating' })

      const [brandResult, webResult] = await Promise.allSettled([
        fetch('/api/blog-writer/scrape-brand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: keyword.trim() }),
        }).then(r => r.json()),
        fetch('/api/blog-writer/scrape-web', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: keyword.trim() }),
        }).then(r => r.json()),
      ])

      const bScrape = brandResult.status === 'fulfilled' ? brandResult.value : null
      const wRefs = webResult.status === 'fulfilled' ? webResult.value : null

      setBrandScrape(bScrape)
      setWebRefs(wRefs)
      setScrapeStatus({
        brand: bScrape?.productImages?.length > 0 ? 'done' : 'failed',
        web: wRefs?.referenceImages?.length > 0 ? 'done' : 'failed',
      })

      // STAGE 2: Write article with scraped context
      setPhase('writing')
      saveSession({ phase: 'writing', keyword: keyword.trim(), articleType })

      const res = await fetch('/api/blog-writer/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          articleType,
          brandScrape: bScrape,
          webRefs: wRefs,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Generation failed')

      setArticle(data.article)

      // Save session
      saveSession({ phase: 'generating-images', keyword: keyword.trim(), articleType, article: data.article, brandScrape: bScrape, webRefs: wRefs })

      // STEP 2: Parse IMAGE tags from body
      const { blocks: parsedBlocks, imagePairs: parsedPairs } = parseBlogContent(data.article.body_html || '')
      setBlocks(parsedBlocks)
      setImagePairs(parsedPairs)

      const totalImages = countImages(parsedPairs)

      // If no Fal.ai config or no image tags found, skip image generation
      if (!hasFal || totalImages === 0) {
        setPhase('complete')
        const hRes = await fetch('/api/blog-writer/history')
        const hData = await hRes.json()
        if (hData.ok) setHistory(hData.history || [])
        return
      }

      // STEP 3: Generate images sequentially
      setImageProgress({ done: 0, total: totalImages })
      setPhase('generating-images')

      let doneCount = 0
      const finalPairs = { ...parsedPairs }
      const availablePlacements = PLACEMENTS.filter(p => parsedPairs[p])

      for (const placement of availablePlacements) {
        const pair = parsedPairs[placement]

        for (const variant of ['desktop', 'mobile']) {
          setImagePairs(prev => ({
            ...prev,
            [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], status: 'generating' } },
          }))

          try {
            const url = await generateSingleImage(pair[variant].prompt, pair[variant].aspectRatio, pair[variant].referenceImages)

            // Set status: reviewing (Claude vision QA)
            setImagePairs(prev => ({
              ...prev,
              [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], url, status: 'reviewing' } },
            }))

            const review = await reviewImage(url, pair[variant].prompt, placement, pair.alt)

            // If QA fails and we get a refined prompt, regenerate once
            if (!review.pass && review.refinedPrompt) {
              setImagePairs(prev => ({
                ...prev,
                [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], status: 'generating' } },
              }))

              const regenUrl = await generateSingleImage(review.refinedPrompt, pair[variant].aspectRatio, pair[variant].referenceImages)
              const regenReview = await reviewImage(regenUrl, review.refinedPrompt, placement, pair.alt)

              finalPairs[placement] = {
                ...finalPairs[placement],
                [variant]: { ...finalPairs[placement][variant], url: regenUrl, status: 'done', qaScore: regenReview.score, qaIssues: regenReview.issues },
              }
              setImagePairs(prev => ({
                ...prev,
                [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], url: regenUrl, status: 'done', qaScore: regenReview.score, qaIssues: regenReview.issues } },
              }))
            } else {
              finalPairs[placement] = {
                ...finalPairs[placement],
                [variant]: { ...finalPairs[placement][variant], url, status: 'done', qaScore: review.score, qaIssues: review.issues },
              }
              setImagePairs(prev => ({
                ...prev,
                [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], url, status: 'done', qaScore: review.score, qaIssues: review.issues } },
              }))
            }
          } catch (e) {
            finalPairs[placement] = {
              ...finalPairs[placement],
              [variant]: { ...finalPairs[placement][variant], status: 'failed' },
            }
            setImagePairs(prev => ({
              ...prev,
              [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], status: 'failed' } },
            }))
          }

          doneCount++
          setImageProgress({ done: doneCount, total: totalImages })

          // Save session after each image — survives tab switch
          saveSession({
            phase: 'generating-images',
            keyword: keyword.trim(),
            articleType,
            article: data.article,
            blocks: parsedBlocks,
            imagePairs: finalPairs,
            imageProgress: { done: doneCount, total: totalImages },
          })
        }
      }

      // STEP 4: Assemble final output with <picture> tags (all images included by default)
      const output = assembleFinalOutput(parsedBlocks, finalPairs)
      setFinalOutput(output)
      setPhase('complete')

      // Save completed session
      saveSession({ phase: 'complete', finalOutput: output, imagePairs: finalPairs, blocks: parsedBlocks })

      // Refresh history
      const hRes = await fetch('/api/blog-writer/history')
      const hData = await hRes.json()
      if (hData.ok) setHistory(hData.history || [])

    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }, [keyword, articleType, phase, hasFal, generateSingleImage, reviewImage])

  const handlePublish = useCallback(async () => {
    if (!article) return
    setPublishing(true)
    setError('')
    setSuccessMsg('')

    try {
      const publishArticle = finalOutput
        ? { ...article, body_html: finalOutput }
        : article

      const res = await fetch('/api/blog-writer/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article: publishArticle }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Publish failed')

      setSuccessMsg(`Published! ${data.liveUrl}`)

      // Auto-learn: mark all selected images as approved
      fetch('/api/blog-writer/image-feedback-on-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePairs, keyword }),
      }).catch(() => {})

      clearSession()

      const hRes = await fetch('/api/blog-writer/history')
      const hData = await hRes.json()
      if (hData.ok) setHistory(hData.history || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }, [article, finalOutput])

  const handleCopy = useCallback(() => {
    const content = finalOutput || article?.body_html || ''
    if (!content) return

    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [article, finalOutput])

  // Delete a blog from history
  const handleDelete = useCallback(async (id) => {
    if (!confirm('Delete this article from history?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/blog-writer/history/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setHistory(prev => prev.filter(h => h.id !== id))
      }
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeleting(null)
    }
  }, [])

  // Regenerate article from a history keyword
  const handleRegenFromHistory = useCallback((kw, type) => {
    setKeyword(kw)
    setArticleType(type || 'informational')
    // Will trigger generate on next render cycle via the user clicking Generate
    // or we can auto-trigger
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Reset everything for a new article
  const handleReset = useCallback(() => {
    setKeyword('')
    setPhase('idle')
    setError('')
    setSuccessMsg('')
    setArticle(null)
    setBlocks([])
    setImagePairs({})
    setFinalOutput('')
    setCopied(false)
    setImageProgress({ done: 0, total: 0 })
    setSelectedImages({})
    setImagesApplied(false)
    clearSession()
  }, [clearSession])

  // Regenerate only images (keep the article)
  const handleRegenImagesOnly = useCallback(async () => {
    if (!article || !blocks.length) return
    const parsedPairs = {}
    // Re-parse from article to get fresh prompts
    const { imagePairs: freshPairs } = parseBlogContent(article.body_html || '')
    const pairsToUse = Object.keys(freshPairs).length > 0 ? freshPairs : imagePairs

    const availablePlacements = PLACEMENTS.filter(p => pairsToUse[p])
    const totalImages = availablePlacements.length * 2

    // Reset all images to pending
    const resetPairs = {}
    for (const p of availablePlacements) {
      resetPairs[p] = {
        ...pairsToUse[p],
        desktop: { ...pairsToUse[p].desktop, url: undefined, status: 'pending', qaScore: undefined, qaIssues: undefined },
        mobile: { ...pairsToUse[p].mobile, url: undefined, status: 'pending', qaScore: undefined, qaIssues: undefined },
      }
    }
    setImagePairs(resetPairs)
    setImageProgress({ done: 0, total: totalImages })
    setPhase('generating-images')
    setSelectedImages({})
    setImagesApplied(false)

    let doneCount = 0
    const finalPairs = { ...resetPairs }

    for (const placement of availablePlacements) {
      const pair = pairsToUse[placement]

      for (const variant of ['desktop', 'mobile']) {
        setImagePairs(prev => ({
          ...prev,
          [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], status: 'generating' } },
        }))

        try {
          const url = await generateSingleImage(pair[variant].prompt, pair[variant].aspectRatio, pair[variant].referenceImages)

          // Vision QA
          setImagePairs(prev => ({
            ...prev,
            [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], url, status: 'reviewing' } },
          }))

          const review = await reviewImage(url, pair[variant].prompt, placement, pair.alt)

          finalPairs[placement] = {
            ...finalPairs[placement],
            [variant]: { ...finalPairs[placement][variant], url, status: 'done', qaScore: review.score, qaIssues: review.issues },
          }
          setImagePairs(prev => ({
            ...prev,
            [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], url, status: 'done', qaScore: review.score, qaIssues: review.issues } },
          }))
        } catch (e) {
          finalPairs[placement] = {
            ...finalPairs[placement],
            [variant]: { ...finalPairs[placement][variant], status: 'failed' },
          }
          setImagePairs(prev => ({
            ...prev,
            [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], status: 'failed' } },
          }))
        }

        doneCount++
        setImageProgress({ done: doneCount, total: totalImages })
        saveSession({ phase: 'generating-images', keyword, articleType, article, blocks, imagePairs: finalPairs, imageProgress: { done: doneCount, total: totalImages } })
      }
    }

    const output = assembleFinalOutput(blocks, finalPairs)
    setFinalOutput(output)
    setPhase('complete')
    saveSession({ phase: 'complete', finalOutput: output, imagePairs: finalPairs, blocks })
  }, [article, blocks, imagePairs, keyword, articleType, generateSingleImage, reviewImage, saveSession])

  const isRunning = phase === 'researching' || phase === 'writing' || phase === 'generating-images'

  return (
    <div className="page bw-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Blog Writer</h2>
          <p className="page-sub">
            SEO article generator for Gender Reveal Ideas
            {hasFal && ' — Fal.ai FLUX image pipeline active'}
          </p>
        </div>
      </div>

      {/* Input form */}
      <div className="bw-form">
        <div className="bw-form-row">
          <div className="bw-field bw-field-keyword">
            <label>Keyword / Topic</label>
            <input
              type="text"
              className="bw-input"
              placeholder="e.g. gender reveal smoke bombs, confetti cannon ideas"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isRunning) handleGenerate() }}
              disabled={isRunning}
            />
          </div>
          <div className="bw-field">
            <label>Article Type</label>
            <select className="bw-select" value={articleType} onChange={e => setArticleType(e.target.value)} disabled={isRunning}>
              {ARTICLE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label} ({t.words})</option>
              ))}
            </select>
          </div>
          <div className="bw-field bw-field-btn">
            <label>&nbsp;</label>
            <button
              className="btn-primary bw-generate-btn"
              onClick={handleGenerate}
              disabled={isRunning || !keyword.trim()}
            >
              {phase === 'researching' ? '🔍 Researching…' : phase === 'writing' ? '✍ Writing…' : phase === 'generating-images' ? '🖼 Images…' : '✍ Generate Article'}
            </button>
          </div>
        </div>
      </div>

      {/* Status messages */}
      {error && phase === 'error' && <div className="bw-error">⚠️ {error}</div>}
      {successMsg && (
        <div className="bw-success">
          ✅ {successMsg.includes('http') ? (
            <>Published! <a href={successMsg.replace('Published! ', '')} target="_blank" rel="noreferrer">{successMsg.replace('Published! ', '')} →</a></>
          ) : successMsg}
        </div>
      )}

      {/* Phase: Researching (Stage 1) */}
      {phase === 'researching' && (
        <div className="bw-phase-card">
          <div className="bw-phase-icon">🔍</div>
          <div>
            <strong>Researching products</strong>
            <div className="bw-scrape-status">
              <div className="bw-scrape-row">
                <span className="bw-scrape-dot" style={{ background: scrapeStatus.brand === 'done' ? '#34d399' : scrapeStatus.brand === 'failed' ? '#ef4444' : '#f5a623' }} />
                <span>Scraping genderrevealideas.com.au...</span>
                {scrapeStatus.brand === 'done' && brandScrape && (
                  <span className="bw-scrape-count">{brandScrape.productImages?.length || 0} product images found</span>
                )}
              </div>
              <div className="bw-scrape-row">
                <span className="bw-scrape-dot" style={{ background: scrapeStatus.web === 'done' ? '#34d399' : scrapeStatus.web === 'failed' ? '#ef4444' : '#f5a623' }} />
                <span>Gathering web references...</span>
                {scrapeStatus.web === 'done' && webRefs && (
                  <span className="bw-scrape-count">{webRefs.referenceImages?.length || 0} reference images found</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase: Writing article (Stage 2) */}
      {phase === 'writing' && (
        <div className="bw-phase-card">
          <div className="bw-phase-icon">✍️</div>
          <div>
            <strong>Writing article</strong>
            <p className="muted">
              Claude is generating the full SEO article with{' '}
              {brandScrape?.productImages?.length ? `${brandScrape.productImages.length} product refs` : 'no product refs'}{' '}
              and {webRefs?.referenceImages?.length ? `${webRefs.referenceImages.length} web refs` : 'no web refs'}
            </p>
          </div>
        </div>
      )}

      {/* Image generation panel (status rows) */}
      {(phase === 'generating-images' || phase === 'complete') && Object.keys(imagePairs).length > 0 && (
        <ImagePanel
          imagePairs={imagePairs}
          imageProgress={imageProgress}
          phase={phase}
          onRegenerate={handleRegenImage}
          onRegenAll={handleRegenAll}
          regeneratingMap={regeneratingMap}
          regenAllRunning={regenAllRunning}
        />
      )}

      {/* Image selection gallery — visual thumbnails with checkboxes */}
      {phase === 'complete' && Object.keys(imagePairs).length > 0 && (
        <ImageSelectionGallery
          imagePairs={imagePairs}
          selectedImages={selectedImages}
          onToggle={handleToggleImage}
          onApply={handleApplyImages}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onDeleteImage={handleDeleteImage}
          onFeedback={handleImageFeedback}
          feedbackMap={feedbackMap}
        />
      )}

      {/* Feedback comment modal */}
      {feedbackModalKey && (
        <FeedbackModal
          imageKey={feedbackModalKey}
          onSubmit={handleFeedbackComment}
          onClose={() => setFeedbackModalKey(null)}
        />
      )}

      {/* Applied confirmation */}
      {imagesApplied && (
        <div className="bw-success">
          ✅ Selected images applied to article. Ready to publish or copy.
        </div>
      )}

      {/* Article preview (after writing complete) */}
      {article && (phase === 'complete' || phase === 'generating-images') && (
        <div className="bw-article-section">
          <div className="bw-article-header">
            <h3>Generated Article</h3>
            <div className="bw-article-actions">
              <button className="btn-outline bw-delete-btn" onClick={handleReset}>
                🗑 Discard
              </button>
              <button className="btn-outline" onClick={handleCopy} disabled={isRunning}>
                {copied ? '✅ Copied!' : finalOutput ? '📋 Copy HTML + Images' : '📋 Copy HTML'}
              </button>
              <button className="btn-outline" onClick={handleRegenImagesOnly} disabled={isRunning}>
                🖼 Regenerate Images Only
              </button>
              <button className="btn-outline" onClick={handleGenerate} disabled={isRunning}>
                🔄 Regenerate All
              </button>
              <button className="btn-primary" onClick={handlePublish} disabled={publishing || isRunning}>
                {publishing ? '⏳ Publishing…' : '🚀 Publish to Shopify'}
              </button>
            </div>
          </div>

          <SerpPreview article={article} />
          <MetaBlock article={article} />
          <SeoChecklist article={article} />

          {/* Final output with images — or raw body preview */}
          <div className="bw-body-preview">
            <div className="bw-body-label">
              {finalOutput ? 'Article Body (with responsive images)' : 'Article Body'}
            </div>
            <div
              className="bw-body-content"
              dangerouslySetInnerHTML={{ __html: finalOutput || article.body_html }}
            />
          </div>

          {/* Raw HTML output box for copy/paste into Shopify */}
          {finalOutput && phase === 'complete' && (
            <div className="bw-output-box">
              <div className="bw-output-header">
                <span className="bw-output-label">Shopify HTML output</span>
                <button className="btn-outline bw-output-copy" onClick={handleCopy}>
                  {copied ? '✅ Copied' : 'Copy all'}
                </button>
              </div>
              <textarea
                className="bw-output-textarea"
                value={finalOutput}
                readOnly
              />
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && !isRunning && (
        <div className="bw-history">
          <h3 className="bw-history-title">Generation History</h3>
          <div className="bw-history-table">
            <div className="bw-history-header">
              <span className="bw-h-col-kw">Keyword</span>
              <span className="bw-h-col-type">Type</span>
              <span className="bw-h-col-title">Title</span>
              <span className="bw-h-col-words">Words</span>
              <span className="bw-h-col-seo">SEO</span>
              <span className="bw-h-col-status">Status</span>
              <span className="bw-h-col-date">Date</span>
              <span className="bw-h-col-actions">Actions</span>
            </div>
            {history.slice(0, 20).map(h => (
              <div key={h.id} className="bw-history-row">
                <span className="bw-h-col-kw">{h.keyword}</span>
                <span className="bw-h-col-type">{h.articleType}</span>
                <span className="bw-h-col-title" title={h.title}>{h.title?.slice(0, 50)}{h.title?.length > 50 ? '…' : ''}</span>
                <span className="bw-h-col-words">{h.wordCount?.toLocaleString()}</span>
                <span className="bw-h-col-seo">
                  <span className={`bw-seo-chip ${h.checklistScore === h.checklistTotal ? 'perfect' : ''}`}>
                    {h.checklistScore}/{h.checklistTotal}
                  </span>
                </span>
                <span className="bw-h-col-status">
                  <span className={`bw-status-chip bw-status-${h.status}`}>
                    {h.status === 'published' ? '✅ Live' : '📄 Draft'}
                  </span>
                </span>
                <span className="bw-h-col-date">
                  {h.generatedAt ? new Date(h.generatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}
                </span>
                <span className="bw-h-col-actions">
                  <button
                    className="bw-h-action-btn bw-h-regen"
                    onClick={() => handleRegenFromHistory(h.keyword, h.articleType)}
                    title="Regenerate this keyword"
                  >🔄</button>
                  <button
                    className="bw-h-action-btn bw-h-delete"
                    onClick={() => handleDelete(h.id)}
                    disabled={deleting === h.id}
                    title="Delete from history"
                  >{deleting === h.id ? '…' : '🗑'}</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
