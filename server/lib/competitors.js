/**
 * Competitor Tracking
 * Monitor competitor SEO strategies
 */

export const COMPETITORS = {
  GRI: [
    { name: 'Baby Hints and Tips', url: 'https://www.babyhintsandtips.com' },
    { name: 'Etsy Gender Reveal', url: 'https://www.etsy.com/au/market/gender_reveal' },
    { name: 'Party Supplies Australia', url: 'https://www.partysuppliesaustralia.com.au' },
    { name: 'The Party People', url: 'https://www.thepartypeople.com.au' }
  ],
  Lionzen: [
    { name: 'Life Cykel', url: 'https://www.lifecykel.com' },
    { name: 'Teelixir', url: 'https://teelixir.com.au' },
    { name: 'SuperFeast', url: 'https://superfeast.com.au' }
  ],
  GBU: []
}

/**
 * Get competitors for a company
 */
export function getCompetitors(company = 'GRI') {
  return COMPETITORS[company] || []
}

/**
 * Add a competitor
 */
export function addCompetitor(company, name, url) {
  if (!COMPETITORS[company]) {
    COMPETITORS[company] = []
  }
  
  COMPETITORS[company].push({ name, url })
  return { ok: true, competitors: COMPETITORS[company] }
}
