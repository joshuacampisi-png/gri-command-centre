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
    return (
      <span className="bw-img-variant">
        {variant}
        {s.status === 'done' && s.url ? (
          <>
            {s.qaScore > 0 && (
              <span className={`bw-qa-score ${s.qaScore >= 8 ? 'high' : s.qaScore >= 6 ? 'mid' : 'low'}`}
                title={s.qaIssues?.join(', ') || 'No issues'}>
                {s.qaScore}/10
              </span>
            )}
            <a href={s.url} target="_blank" rel="noreferrer" className="bw-img-view">view</a>
            <button
              className="bw-img-regen-btn"
              onClick={() => onRegenerate(variant)}
              disabled={isRegen}
              title={`Regenerate ${variant}`}
            >↻</button>
          </>
        ) : (
          <span className="bw-img-status" style={{ color: DOT_COLORS[s.status] }}>
            {s.status === 'reviewing' ? 'QA review' : s.status}
          </span>
        )}
      </span>
    )
  }

  const overall = getOverall()
  const canRegenBoth = pair.desktop.status === 'done' && pair.mobile.status === 'done'

  return (
    <div className="bw-img-row">
      <span className="bw-img-dot" style={{ background: DOT_COLORS[overall] }} />
      <span className="bw-img-label">{label}</span>
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
          FLUX 1.1 Pro Ultra — {imageProgress.done}/{imageProgress.total} generated
        </span>
        {phase === 'generating-images' && (
          <div className="bw-images-progress">
            <div className="bw-images-progress-bar" style={{ width: `${pct}%` }} />
          </div>
        )}
        {allDone && phase === 'complete' && (
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

// ── Main component ────────────────────────────────────────────

export default function BlogWriterTab() {
  const [keyword, setKeyword] = useState('')
  const [articleType, setArticleType] = useState('informational')
  const [phase, setPhase] = useState('idle') // idle | writing | generating-images | complete | error
  const [article, setArticle] = useState(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [history, setHistory] = useState([])
  const [copied, setCopied] = useState(false)
  const [hasFal, setHasFal] = useState(false)

  // Image pipeline state
  const [blocks, setBlocks] = useState([])
  const [imagePairs, setImagePairs] = useState({})
  const [imageProgress, setImageProgress] = useState({ done: 0, total: 0 })
  const [finalOutput, setFinalOutput] = useState('')
  const [regeneratingMap, setRegeneratingMap] = useState({}) // { placement: 'desktop'|'mobile'|'both' }
  const [regenAllRunning, setRegenAllRunning] = useState(false)

  // Load history + check Higgsfield config on mount
  useEffect(() => {
    fetch('/api/blog-writer/history')
      .then(r => r.json())
      .then(d => { if (d.ok) setHistory(d.history || []) })
      .catch(() => {})
    fetch('/api/blog-writer/image-config')
      .then(r => r.json())
      .then(d => { if (d.ok) setHasFal(d.hasFal) })
      .catch(() => {})
  }, [])

  const generateSingleImage = useCallback(async (prompt, aspectRatio) => {
    const res = await fetch('/api/blog-writer/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, aspectRatio }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Image generation failed')
    return data.imageUrl
  }, [])

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
      // If QA fails, don't block the pipeline — just pass
      return { score: 0, pass: true, issues: ['QA unavailable'] }
    }
  }, [])

  // Generate with QA loop: generate → review → auto-regen if score < 6 (max 2 attempts)
  const generateWithQA = useCallback(async (prompt, aspectRatio, placement, alt, maxAttempts = 2) => {
    let currentPrompt = prompt
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const imageUrl = await generateSingleImage(currentPrompt, aspectRatio)

      // Review with Claude vision
      const review = await reviewImage(imageUrl, currentPrompt, placement, alt)

      if (review.pass || attempt === maxAttempts - 1) {
        // Accept the image (passed QA or final attempt)
        return { imageUrl, review }
      }

      // Failed QA — use refined prompt if available
      console.log(`[ImageQA] ${placement} scored ${review.score}/10, regenerating with refined prompt`)
      if (review.refinedPrompt) {
        currentPrompt = review.refinedPrompt
      }
    }
    // Shouldn't reach here, but safety fallback
    const imageUrl = await generateSingleImage(currentPrompt, aspectRatio)
    return { imageUrl, review: { score: 0, pass: true, issues: [] } }
  }, [generateSingleImage, reviewImage])

  // Regenerate a single image variant (or both) for a placement
  const handleRegenImage = useCallback(async (placement, variant) => {
    // variant: 'desktop' | 'mobile' | 'both'
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

    // Reassemble final output
    setImagePairs(latest => {
      const output = assembleFinalOutput(blocks, latest)
      setFinalOutput(output)
      return latest
    })

    setRegenAllRunning(false)
  }, [imagePairs, blocks, generateSingleImage])

  const handleGenerate = useCallback(async () => {
    if (!keyword.trim() || phase === 'writing' || phase === 'generating-images') return

    setPhase('writing')
    setError('')
    setSuccessMsg('')
    setArticle(null)
    setBlocks([])
    setImagePairs({})
    setFinalOutput('')
    setCopied(false)
    setImageProgress({ done: 0, total: 0 })

    try {
      // STEP 1: Generate blog article via Claude (with IMAGE tags)
      const res = await fetch('/api/blog-writer/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), articleType }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Generation failed')

      setArticle(data.article)

      // STEP 2: Parse IMAGE tags from body
      const { blocks: parsedBlocks, imagePairs: parsedPairs } = parseBlogContent(data.article.body_html || '')
      setBlocks(parsedBlocks)
      setImagePairs(parsedPairs)

      const totalImages = countImages(parsedPairs)

      // If no Fal.ai config or no image tags found, skip image generation
      if (!hasFal || totalImages === 0) {
        setPhase('complete')
        // Refresh history
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
          // Set status: generating
          setImagePairs(prev => ({
            ...prev,
            [placement]: { ...prev[placement], [variant]: { ...prev[placement][variant], status: 'generating' } },
          }))

          try {
            const url = await generateSingleImage(pair[variant].prompt, pair[variant].aspectRatio)

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

              const regenUrl = await generateSingleImage(review.refinedPrompt, pair[variant].aspectRatio)
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
        }
      }

      // STEP 4: Assemble final output with <picture> tags
      const output = assembleFinalOutput(parsedBlocks, finalPairs)
      setFinalOutput(output)
      setPhase('complete')

      // Refresh history
      const hRes = await fetch('/api/blog-writer/history')
      const hData = await hRes.json()
      if (hData.ok) setHistory(hData.history || [])

    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }, [keyword, articleType, phase, hasFal, generateSingleImage])

  const handlePublish = useCallback(async () => {
    if (!article) return
    setPublishing(true)
    setError('')
    setSuccessMsg('')

    try {
      // If we have final output with images, use that as body_html
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

  const isRunning = phase === 'writing' || phase === 'generating-images'

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
              {phase === 'writing' ? '✍ Writing…' : phase === 'generating-images' ? '🖼 Images…' : '✍ Generate Article'}
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

      {/* Phase: Writing article */}
      {phase === 'writing' && (
        <div className="bw-phase-card">
          <div className="bw-phase-icon">✍️</div>
          <div>
            <strong>Writing article</strong>
            <p className="muted">Claude is generating the full SEO article and engineering 8 image prompts</p>
          </div>
        </div>
      )}

      {/* Image generation panel */}
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

      {/* Article preview (after writing complete) */}
      {article && (phase === 'complete' || phase === 'generating-images') && (
        <div className="bw-article-section">
          <div className="bw-article-header">
            <h3>Generated Article</h3>
            <div className="bw-article-actions">
              <button className="btn-outline" onClick={handleCopy} disabled={isRunning}>
                {copied ? '✅ Copied!' : finalOutput ? '📋 Copy HTML + Images' : '📋 Copy HTML'}
              </button>
              <button className="btn-outline" onClick={handleGenerate} disabled={isRunning}>
                🔄 Regenerate
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
