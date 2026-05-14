/**
 * City data for SEO city collection pages.
 * Source of truth for content + schema across DEFEND + CLIMB + BUILD tracks.
 */

export const REVIEW_DATA = {
  ratingValue: '4.85',
  reviewCount: '1360',
  bestRating: '5',
  worstRating: '1',
}

// Visible review block prepended to collection.body_html
// Numbers MUST match REVIEW_DATA exactly (Google compliance)
export const REVIEW_BLOCK_HTML = `<div class="seo-review-aggregate" style="text-align:center; padding:14px 20px; background:#fff7f9; margin:0 0 20px 0; border-radius:8px; border:1px solid #ffd6e2;">
  <span style="color:#ffa500; font-size:18px; letter-spacing:2px;">★★★★★</span>
  <strong style="font-size:16px; margin-left:6px;">${REVIEW_DATA.ratingValue}/5</strong>
  <span> · </span>
  <strong>${REVIEW_DATA.reviewCount}+ Australian customer reviews</strong>
  <span> · </span>
  <span style="color:#666;">Verified by Judge.me</span>
</div>`

export const REVIEW_BLOCK_MARKER = 'seo-review-aggregate' // for idempotency detection

// All cities with full city-specific content
export const CITIES = [
  {
    handle: 'gender-reveal-ideas-brisbane',
    city: 'Brisbane',
    state: 'QLD',
    stateFull: 'Queensland',
    track: 'DEFEND',
    climate: "Brisbane's dry season from May to October is ideal for outdoor reveals. Warm sunny days with low rainfall make it perfect to celebrate outside year-round.",
    venues: ['New Farm Park', 'South Bank Parklands', 'Mt Coot-tha Lookout', 'Roma Street Parkland', 'Wynnum Foreshore', 'Kangaroo Point Cliffs Park', 'Sandgate Foreshore', 'Manly Boat Harbour'],
    suburbs: ['Brisbane CBD', 'Fortitude Valley', 'New Farm', 'West End', 'Paddington', 'Newstead', 'South Brisbane', 'Indooroopilly', 'Chermside', 'Mt Gravatt', 'Carindale', 'Sunnybank'],
    deliveryDays: 'next day',
    fromGoldCoast: true,
  },
  {
    handle: 'gender-reveal-ideas-adelaide',
    city: 'Adelaide',
    state: 'SA',
    stateFull: 'South Australia',
    track: 'DEFEND',
    climate: "Adelaide's mild Mediterranean climate makes spring (Sep-Nov) and autumn (Mar-May) ideal for outdoor reveals. Summer evenings are also perfect for sunset celebrations.",
    venues: ['Adelaide Botanic Garden', 'Glenelg Beach', 'Adelaide Hills', 'Bonython Park', 'Henley Beach', 'Cleland Conservation Park', 'Brighton Jetty', 'Belair National Park'],
    suburbs: ['Adelaide CBD', 'North Adelaide', 'Glenelg', 'Henley Beach', 'Norwood', 'Unley', 'Burnside', 'Mawson Lakes', 'Marion', 'Tea Tree Gully', 'Salisbury', 'Holdfast Bay'],
    deliveryDays: '2 to 3 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-gold-coast',
    city: 'Gold Coast',
    state: 'QLD',
    stateFull: 'Queensland',
    track: 'DEFEND',
    climate: "The Gold Coast's subtropical climate means year-round reveals are possible, with May to October offering the driest conditions and most sunshine.",
    venues: ['Burleigh Heads', 'Broadbeach Parklands', 'Currumbin Valley', 'Tallebudgera Creek', 'Coolangatta Beach', 'Surfers Paradise Beach', 'Mermaid Beach', 'Springbrook National Park'],
    suburbs: ['Surfers Paradise', 'Broadbeach', 'Mermaid Beach', 'Burleigh Heads', 'Palm Beach', 'Coolangatta', 'Robina', 'Helensvale', 'Southport', 'Bundall', 'Ashmore', 'Mudgeeraba'],
    deliveryDays: 'same day pickup or next day',
    fromGoldCoast: true,
    homeBase: true,
  },
  {
    handle: 'gender-reveal-ideas-darwin',
    city: 'Darwin',
    state: 'NT',
    stateFull: 'Northern Territory',
    track: 'DEFEND',
    climate: "Darwin's dry season (May to October) is best for outdoor reveals. Warm temperatures and low humidity make any park or beach perfect. Avoid the wet season (Nov-Apr) for outdoor events.",
    venues: ['Mindil Beach', 'East Point Reserve', 'Darwin Esplanade', 'Casuarina Beach', 'Lee Point Beach', 'George Brown Botanic Gardens', 'Bicentennial Park', 'Nightcliff Foreshore'],
    suburbs: ['Darwin CBD', 'Larrakeyah', 'Stuart Park', 'Parap', 'Fannie Bay', 'Nightcliff', 'Casuarina', 'Palmerston', 'Marrara', 'Coconut Grove', 'Rapid Creek', 'Millner'],
    deliveryDays: '3 to 5 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-perth',
    city: 'Perth',
    state: 'WA',
    stateFull: 'Western Australia',
    track: 'CLIMB',
    climate: "Perth's dry summer and mild winter mean almost any time of year works for an outdoor reveal. Spring (Sep-Nov) is especially beautiful with wildflowers in bloom.",
    venues: ['Kings Park & Botanic Garden', 'Cottesloe Beach', 'Swan Valley', 'Hillarys Boat Harbour', 'Whiteman Park', 'Matilda Bay Reserve', 'Scarborough Beach', 'City Beach', 'Lake Monger Reserve', 'Yanchep National Park'],
    suburbs: ['Perth CBD', 'Subiaco', 'Cottesloe', 'Fremantle', 'Scarborough', 'Joondalup', 'Mandurah', 'Rockingham', 'Midland', 'Armadale', 'Cannington', 'Morley'],
    deliveryDays: '2 to 4 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-sydney',
    city: 'Sydney',
    state: 'NSW',
    stateFull: 'New South Wales',
    track: 'CLIMB',
    climate: "Sydney's mild autumn (March to May) and spring (September to November) are ideal for outdoor reveals. Summer beach days are also perfect for early morning or sunset celebrations.",
    venues: ['Centennial Park', 'Royal Botanic Garden', 'Manly Beach', 'Bondi Beach', 'Bicentennial Park (Glebe)', 'Lane Cove National Park', 'Cabarita Park', 'Cronulla Beach', 'Coogee Beach', 'Parramatta Park'],
    suburbs: ['Sydney CBD', 'Bondi', 'Manly', 'Surry Hills', 'Newtown', 'Paddington', 'Coogee', 'Cronulla', 'Parramatta', 'Chatswood', 'Hornsby', 'Penrith', 'Liverpool', 'Hurstville'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-melbourne',
    city: 'Melbourne',
    state: 'VIC',
    stateFull: 'Victoria',
    track: 'CLIMB',
    climate: "Melbourne weather is famously unpredictable — spring (Sep-Nov) gives you the best chance of sunshine for an outdoor reveal. Always have a backup indoor venue planned.",
    venues: ['Royal Botanic Gardens', 'Princes Park', 'Yarra Trail', 'Albert Park', 'Brighton Beach', 'St Kilda Beach', 'Carlton Gardens', 'Fitzroy Gardens', 'Williamstown Beach', 'Dandenong Ranges'],
    suburbs: ['Melbourne CBD', 'Fitzroy', 'Richmond', 'St Kilda', 'South Yarra', 'Carlton', 'Brunswick', 'Brighton', 'Doncaster', 'Camberwell', 'Frankston', 'Footscray', 'Geelong', 'Ringwood'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-newcastle',
    city: 'Newcastle',
    state: 'NSW',
    stateFull: 'New South Wales',
    track: 'BUILD',
    climate: "Newcastle's mild coastal climate makes spring (Sep-Nov) and autumn (Mar-May) ideal for outdoor reveals. Beach reveals work year-round with warm sea breezes.",
    venues: ['Bar Beach', 'Merewether Beach', 'Civic Park', 'Foreshore Park', 'Newcastle Memorial Walk', 'Speers Point Park', 'Glenrock State Conservation Area', 'King Edward Park', 'Nobbys Beach', 'Stockton Beach'],
    suburbs: ['Newcastle CBD', 'Newcastle West', 'Hamilton', 'Charlestown', 'Mayfield', 'Adamstown', 'Cooks Hill', 'Wickham', 'The Junction', 'Bar Beach', 'Merewether', 'New Lambton'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-canberra',
    city: 'Canberra',
    state: 'ACT',
    stateFull: 'Australian Capital Territory',
    track: 'BUILD',
    climate: "Canberra's continental climate gives you warm spring (Oct-Nov) and autumn (Mar-Apr) days ideal for outdoor reveals. Cool clear winter days also work beautifully for daytime events.",
    venues: ['Lake Burley Griffin', 'Commonwealth Park', 'Stromlo Forest Park', 'Black Mountain', 'Mount Ainslie', 'National Arboretum', 'Telopea Park', 'Lake Tuggeranong', 'Weston Park', 'Pine Island Reserve'],
    suburbs: ['Civic', 'Belconnen', 'Gungahlin', 'Tuggeranong', 'Woden', 'Inner South', 'Manuka', 'Kingston', 'Braddon', 'Dickson', 'Yarralumla', 'Forrest'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-sunshine-coast',
    city: 'Sunshine Coast',
    state: 'QLD',
    stateFull: 'Queensland',
    track: 'BUILD',
    climate: "The Sunshine Coast's subtropical climate means year-round outdoor reveals. Beach reveals work brilliantly with golden sand and gentle surf as your backdrop.",
    venues: ['Mooloolaba Beach', 'Maroochydore Beach', 'Noosa Heads Main Beach', 'Cotton Tree Park', 'Coolum Beach', 'Sunshine Beach', 'Glass House Mountains Lookout', 'Buderim Forest Park', 'Kings Beach Caloundra', 'Currimundi Lake'],
    suburbs: ['Maroochydore', 'Mooloolaba', 'Caloundra', 'Noosa Heads', 'Coolum Beach', 'Buderim', 'Nambour', 'Currimundi', 'Pelican Waters', 'Sippy Downs', 'Mountain Creek', 'Kawana Waters'],
    deliveryDays: 'next day',
    fromGoldCoast: true,
  },
  {
    handle: 'gender-reveal-ideas-wollongong',
    city: 'Wollongong',
    state: 'NSW',
    stateFull: 'New South Wales',
    track: 'BUILD',
    climate: "Wollongong's mild coastal climate makes outdoor reveals possible year-round. Spring (Sep-Nov) and autumn (Mar-May) offer the most comfortable temperatures.",
    venues: ['North Beach', 'City Beach', 'Stuart Park', 'Mount Keira Lookout', 'Lang Park', 'Belmore Basin', 'Sandon Point', 'Austinmer Beach', 'Bulli Beach', 'Thirroul Beach'],
    suburbs: ['Wollongong CBD', 'Fairy Meadow', 'North Wollongong', 'Figtree', 'Mangerton', 'Keiraville', 'Mount Keira', 'Bulli', 'Corrimal', 'Thirroul', 'Dapto', 'Shellharbour'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-hobart',
    city: 'Hobart',
    state: 'TAS',
    stateFull: 'Tasmania',
    track: 'BUILD',
    climate: "Hobart's cool temperate climate makes summer (Dec-Feb) ideal for outdoor reveals. Autumn (Mar-May) is stunning with colourful foliage as your backdrop.",
    venues: ['Mount Wellington', 'Salamanca Place', 'Sandy Bay Beach', 'Royal Tasmanian Botanical Gardens', 'Battery Point', 'Long Beach', 'Cornelian Bay', 'Bellerive Beach', 'Kingston Beach', 'Mount Nelson Lookout'],
    suburbs: ['Hobart CBD', 'Sandy Bay', 'Battery Point', 'North Hobart', 'Glenorchy', 'Kingston', 'New Town', 'Bellerive', 'Howrah', 'Lindisfarne', 'West Hobart', 'Moonah'],
    deliveryDays: '2 to 4 days',
    fromGoldCoast: false,
  },
]

// Generate the LocalBusiness + AggregateRating + Organization @graph for a city
export function buildSchemaForCity(c) {
  const url = `https://genderrevealideas.com.au/collections/${c.handle}`
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': `${url}#localbusiness`,
        name: `Gender Reveal Ideas ${c.city}`,
        description: `${c.city}'s biggest range of gender reveal cannons, smoke bombs, powder blasters and sports reveals. Free express shipping across ${c.stateFull}.`,
        url,
        image: 'https://genderrevealideas.com.au/cdn/shop/files/GRI_Logo_Horizontal_Transparent_v2.png',
        logo: 'https://genderrevealideas.com.au/cdn/shop/files/GRI_Logo_Horizontal_Transparent_v2.png',
        telephone: '+61406860077',
        priceRange: '$15-$350',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Gold Coast',
          addressRegion: 'QLD',
          addressCountry: 'AU',
        },
        areaServed: {
          '@type': 'City',
          name: c.city,
          containedInPlace: { '@type': 'AdministrativeArea', name: c.stateFull },
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: REVIEW_DATA.ratingValue,
          reviewCount: REVIEW_DATA.reviewCount,
          bestRating: REVIEW_DATA.bestRating,
          worstRating: REVIEW_DATA.worstRating,
        },
        sameAs: [
          'https://www.instagram.com/gender.reveal.ideass/',
          'https://www.youtube.com/@GenderRevealIdeasAustralia',
          'https://www.tiktok.com/@genderrevealaustralia',
          'https://www.facebook.com/people/Gender-Reveal-Ideas/61554986474593/',
        ],
      },
      {
        '@type': 'Organization',
        '@id': 'https://genderrevealideas.com.au/#organization',
        name: 'Gender Reveal Ideas',
        url: 'https://genderrevealideas.com.au',
        logo: 'https://genderrevealideas.com.au/cdn/shop/files/GRI_Logo_Horizontal_Transparent_v2.png',
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: '+61406860077',
          contactType: 'customer service',
          areaServed: 'AU',
          availableLanguage: 'English',
        },
      },
    ],
  }, null, 2)
}

// Generate enhanced rich text for looking_to_buy_location_text metafield
export function buildLocationText(c) {
  const venuesList = c.venues.slice(0, 5).join(', ')
  const suburbsCount = c.suburbs.length
  return {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: `Planning your gender reveal party in ${c.city}? Look no further. Gender Reveal Ideas is Australia's #1 gender reveal store, trusted by over 70,000 families across ${c.stateFull} and beyond. Our locally-curated ${c.city} range includes smoke cannons, powder blasters, confetti poppers, sports reveals and balloon kits — everything you need to make your reveal moment unforgettable. From small family gatherings to big celebrations with friends, our products are designed to bring excitement and joy to your day.` },
        ],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: `Why ${c.city} parents choose Gender Reveal Ideas: ${c.climate} Popular ${c.city} reveal venues include ${venuesList}, plus another ${c.venues.length - 5}+ public parks and beaches throughout the region. All our products are Australian-safety-tested, 100% eco-friendly, biodegradable, and leave no trace behind — so you can celebrate at any ${c.city} park or beach with full confidence.` },
        ],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: `${c.city} delivery: orders ship same-day from our Gold Coast warehouse. Express delivery to ${c.city} arrives in ${c.deliveryDays}. We deliver to ${suburbsCount}+ ${c.city} suburbs including ${c.suburbs.slice(0, 6).join(', ')} and surrounding areas. Free shipping on orders over $150. Rated ${REVIEW_DATA.ratingValue}/5 from ${REVIEW_DATA.reviewCount}+ Australian customer reviews verified by Judge.me.` },
        ],
      },
    ],
  }
}

// Build the meta description (per-city)
export function buildMetaDescription(c) {
  return `${c.city}'s biggest range of gender reveal ideas with ${c.deliveryDays} delivery${c.fromGoldCoast ? ' from the Gold Coast' : ''}. Cannons, smoke bombs, powder blasters and sports reveals. ${REVIEW_DATA.ratingValue}★ from ${REVIEW_DATA.reviewCount}+ reviews. Eco friendly. Free shipping.`
}

// Build the title tag
export function buildTitleTag(c) {
  if (c.state === 'WA') return `Gender Reveal Ideas ${c.city} | WA's #1 Range | ${REVIEW_DATA.ratingValue}★ Reviews`
  return `Gender Reveal Ideas ${c.city} | ${c.city}'s #1 Range | ${REVIEW_DATA.ratingValue}★ Reviews`
}
