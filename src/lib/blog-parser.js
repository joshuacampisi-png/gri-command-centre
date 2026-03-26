/**
 * Blog Parser
 * Extracts IMAGE_DESKTOP and IMAGE_MOBILE tags from Claude's output,
 * maps them into image pairs, and builds ordered content blocks.
 * Also assembles final HTML with <picture> tags injected.
 */

const PLACEMENTS = ['hero', 'inline-1', 'inline-2', 'inline-3']

const DESKTOP_REGEX = /\[IMAGE_DESKTOP:\s*placement="([^"]+)"\s+aspectRatio="([^"]+)"\s+resolution="([^"]+)"\s+alt="([^"]+)"\s+prompt="([^"]+)"\]/g
const MOBILE_REGEX  = /\[IMAGE_MOBILE:\s*placement="([^"]+)"\s+aspectRatio="([^"]+)"\s+resolution="([^"]+)"\s+alt="([^"]+)"\s+prompt="([^"]+)"\]/g

export function parseBlogContent(raw) {
  // Collect desktop tags
  const desktopTags = {}
  let m
  while ((m = DESKTOP_REGEX.exec(raw)) !== null) {
    desktopTags[m[1]] = {
      variant: 'desktop', placement: m[1],
      aspectRatio: m[2], resolution: m[3], alt: m[4], prompt: m[5],
    }
  }

  // Collect mobile tags
  const mobileTags = {}
  while ((m = MOBILE_REGEX.exec(raw)) !== null) {
    mobileTags[m[1]] = {
      variant: 'mobile', placement: m[1],
      aspectRatio: m[2], resolution: m[3], alt: m[4], prompt: m[5],
    }
  }

  // Build image pairs
  const imagePairs = {}
  for (const placement of PLACEMENTS) {
    const d = desktopTags[placement]
    const mb = mobileTags[placement]
    if (d || mb) {
      imagePairs[placement] = {
        placement,
        alt: d?.alt || mb?.alt || '',
        desktop: {
          prompt: d?.prompt || '',
          aspectRatio: d?.aspectRatio || '16:9',
          status: 'pending',
        },
        mobile: {
          prompt: mb?.prompt || '',
          aspectRatio: mb?.aspectRatio || '9:16',
          status: 'pending',
        },
      }
    }
  }

  // Build content blocks: strip IMAGE tags and split into text/image-pair blocks
  const combinedTagRegex = /\[IMAGE_(?:DESKTOP|MOBILE):[^\]]+\]\n?/g
  const stripped = raw.replace(combinedTagRegex, (match) => {
    const placementMatch = match.match(/placement="([^"]+)"/)
    const placement = placementMatch?.[1] || ''
    return `\n%%IMAGE:${placement}%%\n`
  })

  // Deduplicate consecutive markers for same placement
  const deduped = stripped.replace(/(%%IMAGE:([^%]+)%%)\n?\n?\1/g, '$1')

  const parts = deduped.split(/\n?%%IMAGE:([^%]+)%%\n?/)
  const blocks = []

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const text = parts[i].trim()
      if (text) blocks.push({ type: 'text', text })
    } else {
      const placement = parts[i].trim()
      if (imagePairs[placement]) {
        blocks.push({ type: 'image-pair', placement })
      }
    }
  }

  return { blocks, imagePairs }
}

// Count total images to generate (2 per pair: desktop + mobile)
export function countImages(imagePairs) {
  return Object.keys(imagePairs).length * 2
}

// Assemble final HTML with <picture> tags injected
export function assembleFinalOutput(blocks, imagePairs) {
  return blocks.map(block => {
    if (block.type === 'text') return block.text || ''

    if (block.type === 'image-pair' && block.placement) {
      const pair = imagePairs[block.placement]
      if (!pair) return ''

      const desktopUrl = pair.desktop.url
      const mobileUrl  = pair.mobile.url
      const isHero     = block.placement === 'hero'
      const loading    = isHero ? 'eager' : 'lazy'
      const fetchpriority = isHero ? ' fetchpriority="high"' : ''

      if (desktopUrl && mobileUrl) {
        return `<picture>
  <source media="(max-width: 767px)" srcset="${mobileUrl}">
  <img src="${desktopUrl}" alt="${pair.alt}" width="1200" height="675" loading="${loading}"${fetchpriority}>
</picture>`
      }

      if (desktopUrl) {
        return `<img src="${desktopUrl}" alt="${pair.alt}" width="1200" height="675" loading="${loading}"${fetchpriority}>`
      }

      return `<!-- Image failed: ${pair.alt} -->`
    }

    return ''
  }).join('\n\n')
}

export { PLACEMENTS }
