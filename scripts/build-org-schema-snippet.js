/**
 * Generate Organization + WebSite schema snippets ready to paste into theme.liquid
 * Save as /tmp/org-schema-snippet.html so Josh can copy-paste
 */
import { writeFileSync } from 'fs'

const ORG_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Gender Reveal Ideas Australia",
  "alternateName": ["Gender Reveal Ideas", "GRI"],
  "url": "https://genderrevealideas.com.au",
  "logo": "https://genderrevealideas.com.au/cdn/shop/files/gri-logo.png",
  "foundingDate": "2019",
  "founder": {
    "@type": "Person",
    "name": "Gender Reveal Ideas Founder",
    "description": "Founder of Australia's #1 gender reveal retailer"
  },
  "areaServed": {
    "@type": "Country",
    "name": "Australia"
  },
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Gold Coast",
    "addressRegion": "QLD",
    "addressCountry": "AU"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "Customer Service",
    "email": "hello@genderrevealideas.com.au",
    "availableLanguage": "English",
    "areaServed": "AU"
  },
  "sameAs": [
    "https://www.instagram.com/gender.reveal.ideass",
    "https://www.tiktok.com/@genderrevealaustralia",
    "https://www.facebook.com/genderrevealideasaustralia",
    "https://www.youtube.com/@GenderRevealIdeasAustralia",
    "https://www.localsearch.com.au/profile/gender-reveal-ideas/clrio3eyz001a08l7es8ye90a"
  ],
  "description": "Australia's #1 gender reveal retailer since 2019. Government-approved smoke bombs, biodegradable powder cannons, Mega Blaster extinguishers, sports reveal balls, bundles and TNT rentals. Trusted by 70,000+ Australian families.",
  "knowsAbout": [
    "Gender reveal parties",
    "Pregnancy announcements",
    "Baby gender reveal",
    "Gender reveal smoke bombs",
    "Gender reveal cannons",
    "Australian gender reveal products"
  ],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.85",
    "reviewCount": "1740",
    "bestRating": "5",
    "worstRating": "1"
  },
  "award": [
    "Featured on ABC",
    "Featured on Channel 9 Weekend Sunrise",
    "Featured on Sea FM",
    "Featured on Gold Coast Bulletin",
    "Australia's #1 Gender Reveal Retailer 2025-2026"
  ],
  "memberOf": {
    "@type": "Organization",
    "name": "Resources Safety & Health Queensland",
    "url": "https://www.rshq.qld.gov.au/",
    "description": "Registered as Schedule 6 supplier under the Explosives Regulation"
  }
}

const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Gender Reveal Ideas Australia",
  "url": "https://genderrevealideas.com.au",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://genderrevealideas.com.au/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Gender Reveal Ideas Australia"
  }
}

const SNIPPET = `<!-- ============================================================
     SITEWIDE SCHEMA — Organization + WebSite
     Paste this into theme.liquid INSIDE the <head> tag
     Right before the closing </head>
     This gives AI search engines + Google rich result eligibility
     across the entire site. Adds E-E-A-T authority signals.
     ============================================================ -->
<script type="application/ld+json">
${JSON.stringify(ORG_SCHEMA, null, 2)}
</script>

<script type="application/ld+json">
${JSON.stringify(WEBSITE_SCHEMA, null, 2)}
</script>
`

writeFileSync('/tmp/gri-org-schema-snippet.html', SNIPPET)
writeFileSync('/Users/wogbot/Desktop/GRI-AI-Search-Snippets/org-schema-for-theme.html', SNIPPET)
console.log('✓ Organization + WebSite schema written to:')
console.log('  /Users/wogbot/Desktop/GRI-AI-Search-Snippets/org-schema-for-theme.html')
console.log(`\n  Total schema length: ${SNIPPET.length} chars`)
console.log(`\n📋 Next step for Josh:`)
console.log(`  1. Shopify Admin → Online Store → Themes → ⋯ → Edit code`)
console.log(`  2. Open layout/theme.liquid`)
console.log(`  3. Find the </head> tag (usually around line 50-100)`)
console.log(`  4. Paste this snippet RIGHT BEFORE </head>`)
console.log(`  5. Save → site goes live with sitewide org schema in seconds`)
process.exit(0)
