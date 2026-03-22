/**
 * Trends Blog Brief Generator
 * Generates SEO blog briefs when Google Trends spikes are detected.
 */

import { callClaude } from './claude-guard.js'

function getPublishTiming() {
  const day = new Date().getDay()
  return day >= 1 && day <= 3
    ? 'Spike detected early week. Aim to publish by Friday for peak weekend search activity.'
    : 'Spike detected late week. Aim to publish by next Tuesday for the Monday/Tuesday recovery window.'
}

function buildPrompt(spike) {
  return `You are an SEO content strategist for Gender Reveal Ideas (genderrevealideas.com.au), an Australian e-commerce brand selling gender reveal products from the Gold Coast.

A Google Trends spike has been detected:
- Search Term: "${spike.keyword}"
- Spike Type: ${spike.type}
- Change: ${spike.changePercent ? `+${spike.changePercent}%` : `+${spike.percentIncrease}%`} above baseline
- Detected: ${spike.detectedAt}

Create a concise SEO blog brief for a 1,200 word article targeting this trend. Output ONLY the brief. Do not write the full article.

TITLE OPTIONS (3):
[3 H1 title options, targeting Australian searchers, no dashes]

TARGET KEYWORD: [primary keyword]
SECONDARY KEYWORDS: [3 to 5 supporting keywords]
SEARCH INTENT: [informational / commercial / transactional]
CONTENT ANGLE: [the unique hook that makes this article worth reading]

OUTLINE:
- Intro (what the trend is, why Australians are searching it now)
- Section 1: [heading]
- Section 2: [heading]
- Section 3: [heading]
- Section 4: [heading]
- FAQ (3 questions answering what people also ask)
- CTA: Link to genderrevealideas.com.au product most relevant to this term

PRODUCT TO LINK: [most relevant GRI product]
META DESCRIPTION: [155 chars, includes keyword, no dashes]
INTERNAL LINK OPPORTUNITIES: [2 related blog topics]

PUBLISH TIMING: ${getPublishTiming()}

Rules: no dashes in any content. Australian English. E-E-A-T signals. Include "Gender Reveal Ideas" brand name at least twice.`
}

export async function generateBlogBrief(spike) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        spikeKeyword: spike.keyword,
        spikeType: spike.type,
        brief: '[ANTHROPIC_API_KEY not configured. Add to .env to enable blog brief generation.]',
        generatedAt: new Date().toISOString(),
        error: 'NO_API_KEY',
      }
    }

    const msg = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildPrompt(spike) }],
    }, 'trends-blog-generator')

    return {
      spikeKeyword: spike.keyword,
      spikeType: spike.type,
      brief: msg.content[0].text,
      generatedAt: new Date().toISOString(),
      error: null,
    }
  } catch (e) {
    return {
      spikeKeyword: spike.keyword,
      spikeType: spike.type,
      brief: null,
      generatedAt: new Date().toISOString(),
      error: e.message,
    }
  }
}
