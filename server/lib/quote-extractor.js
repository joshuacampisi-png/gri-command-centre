/**
 * quote-extractor.js
 * ─────────────────────────────────────────────────────────────
 * Takes YouTube transcripts from the Gender Reveal Ideas channel
 * and asks Claude Haiku to extract quotable passages said by
 * Michael or the GRI team that are relevant to a blog topic.
 *
 * Output: a curated list of quotes the blog writer can drop
 * verbatim into the article (e.g. "As Michael puts it...").
 * Every quote carries the source videoId + title + url so the
 * content QA step can verify nothing was fabricated.
 * ─────────────────────────────────────────────────────────────
 */

import { callClaude } from './claude-guard.js'

/**
 * @param {Array<{videoId, title, url, transcript}>} transcripts
 * @param {string} keyword
 * @returns {Promise<Array<{
 *   quote: string,
 *   speaker: string,
 *   videoId: string,
 *   videoTitle: string,
 *   videoUrl: string,
 *   topic: string
 * }>>}
 */
export async function extractQuotes(transcripts, keyword, max = 6) {
  if (!transcripts || transcripts.length === 0) return []

  const quotes = []
  for (const t of transcripts.slice(0, 3)) {
    // Trim transcripts to 8k chars to keep Haiku fast and cheap
    const snippet = (t.transcript || '').slice(0, 8000)
    if (snippet.length < 200) continue

    try {
      const result = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: `You extract quotable passages from YouTube video transcripts of the Gender Reveal Ideas team (family-owned Australian brand, Gold Coast). Michael is the founder; the team includes Josh and family members.

Your job: return 2-3 quotable passages from this transcript that are RELEVANT to the blog topic. Each quote must be the team's actual words (not your paraphrase).

Quotes should:
- Be 1-2 sentences long (12-35 words)
- Sound natural spoken English with warmth and authority
- Add value to a blog post about the topic (practical advice, reassurance, a fact, a relatable moment)
- Attribute to "Michael" by default, or "the GRI team" if the speaker is unclear

Respond ONLY as JSON:
{"quotes": [{"quote": "...", "speaker": "Michael", "topic": "short topic label"}]}

If nothing in the transcript is relevant to the topic, return {"quotes": []}.`,
        messages: [{
          role: 'user',
          content: `BLOG TOPIC: "${keyword}"

TRANSCRIPT (from video "${t.title}"):
${snippet}

Return 2-3 quotable passages as JSON.`,
        }],
      }, 'blog-quote-extractor')

      const text = result.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) continue

      let parsed
      try { parsed = JSON.parse(jsonMatch[0]) } catch { continue }
      const extracted = Array.isArray(parsed.quotes) ? parsed.quotes : []

      for (const q of extracted) {
        if (!q?.quote || q.quote.length < 10) continue
        // Final sanity: the quote string must appear (roughly) in the source transcript
        const normQuote = normalize(q.quote)
        const normTranscript = normalize(snippet)
        const appears = normTranscript.includes(normQuote.slice(0, Math.min(40, normQuote.length)))
        if (!appears) {
          console.log(`[QuoteExtractor] Rejected hallucinated quote: "${q.quote.slice(0, 60)}..."`)
          continue
        }
        quotes.push({
          quote: q.quote.trim(),
          speaker: q.speaker || 'Michael',
          videoId: t.videoId,
          videoTitle: t.title,
          videoUrl: t.url,
          topic: q.topic || keyword,
        })
        if (quotes.length >= max) break
      }
      if (quotes.length >= max) break
    } catch (e) {
      console.warn(`[QuoteExtractor] Haiku call failed for ${t.videoId}:`, e.message)
    }
  }

  console.log(`[QuoteExtractor] Curated ${quotes.length} verified quotes from ${transcripts.length} transcripts`)
  return quotes
}

function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
