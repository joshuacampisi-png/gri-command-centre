/**
 * Area data for state + regional collection pages (May 15 2026 push).
 * Extends yesterday's 12-city push with state-level + regional collections
 * targeting where Gender Reveal Express + others own #1.
 */

export const REVIEW_DATA = {
  ratingValue: '4.85',
  reviewCount: '1360',
  bestRating: '5',
  worstRating: '1',
}

export const REVIEW_BLOCK_HTML = `<div class="seo-review-aggregate" style="text-align:center; padding:14px 20px; background:#fff7f9; margin:0 0 20px 0; border-radius:8px; border:1px solid #ffd6e2;">
  <span style="color:#ffa500; font-size:18px; letter-spacing:2px;">★★★★★</span>
  <strong style="font-size:16px; margin-left:6px;">${REVIEW_DATA.ratingValue}/5</strong>
  <span> · </span>
  <strong>${REVIEW_DATA.reviewCount}+ Australian customer reviews</strong>
  <span> · </span>
  <span style="color:#666;">Verified by Judge.me</span>
</div>`

export const REVIEW_BLOCK_MARKER = 'seo-review-aggregate'

// kind: 'state' = whole state/territory ; 'region' = regional city/region
export const AREAS = [
  // ============ STATES (8) ============
  {
    handle: 'gender-reveal-ideas-nsw',
    kind: 'state',
    name: 'NSW',
    nameFull: 'New South Wales',
    state: 'NSW',
    title: 'NSW',
    climate: "NSW's mild climate gives you year-round outdoor reveal options. Coastal areas like Sydney and the Central Coast enjoy warm sunny days, while the spring (Sep-Nov) and autumn (Mar-May) shoulder seasons are ideal everywhere from Newcastle to Wollongong.",
    venues: ['Centennial Park (Sydney)', 'Bar Beach (Newcastle)', 'North Beach (Wollongong)', 'Royal Botanic Garden (Sydney)', 'Hunter Wetlands (Newcastle)', 'Lake Macquarie Foreshore', 'Manly Beach', 'Coogee Beach', 'Royal National Park', 'Blue Mountains lookouts'],
    suburbs: ['Sydney', 'Newcastle', 'Wollongong', 'Central Coast', 'Hunter Valley', 'Blue Mountains', 'Northern Beaches', 'Parramatta', 'Penrith', 'Liverpool', 'Coffs Harbour', 'Port Macquarie', 'Tamworth', 'Wagga Wagga'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-victoria',
    kind: 'state',
    name: 'Victoria',
    nameFull: 'Victoria',
    state: 'VIC',
    title: 'Victoria',
    climate: "Victoria's four-season climate makes spring (Sep-Nov) and early autumn (Mar-Apr) the safest bets for outdoor reveals. Melbourne weather is famously unpredictable — always have an indoor backup. Regional Victoria stays drier than the coast.",
    venues: ['Royal Botanic Gardens (Melbourne)', 'Eastern Beach (Geelong)', 'Lake Wendouree (Ballarat)', 'Albert Park', 'Princes Park', 'Mornington Peninsula', 'Brighton Beach', 'St Kilda Beach', 'Yarra Valley', 'Phillip Island'],
    suburbs: ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Mornington Peninsula', 'Yarra Valley', 'Frankston', 'Dandenong', 'Werribee', 'Cranbourne', 'Pakenham', 'Shepparton', 'Warrnambool', 'Mildura'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-queensland',
    kind: 'state',
    name: 'Queensland',
    nameFull: 'Queensland',
    state: 'QLD',
    title: 'Queensland',
    climate: "Queensland's subtropical to tropical climate means year-round outdoor reveals are a real option. May to October is the dry season with warm sunny days from Brisbane to Cairns — perfect for beaches, parklands and lookouts.",
    venues: ['South Bank Parklands (Brisbane)', 'Burleigh Heads (Gold Coast)', 'Mooloolaba Beach (Sunshine Coast)', 'The Esplanade (Cairns)', 'Strand Beach (Townsville)', 'Picnic Bay (Magnetic Island)', 'Noosa Heads Main Beach', 'New Farm Park', 'Mt Coot-tha Lookout', 'Currumbin Valley'],
    suburbs: ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Cairns', 'Townsville', 'Toowoomba', 'Mackay', 'Rockhampton', 'Bundaberg', 'Hervey Bay', 'Logan', 'Ipswich', 'Redland Bay', 'Caboolture'],
    deliveryDays: 'next day to 2 days',
    fromGoldCoast: true,
  },
  {
    handle: 'gender-reveal-ideas-wa',
    kind: 'state',
    name: 'WA',
    nameFull: 'Western Australia',
    state: 'WA',
    title: 'Western Australia',
    climate: "WA's Mediterranean climate makes Perth and surrounds ideal for outdoor reveals almost year-round. Spring (Sep-Nov) brings wildflowers in bloom. Northern WA stays warm year-round with the dry season (May-Oct) best for outdoor events.",
    venues: ['Kings Park & Botanic Garden (Perth)', 'Cottesloe Beach', 'Scarborough Beach', 'Margaret River foreshore', 'Mandurah Foreshore', 'Town Beach (Broome)', 'Town Beach (Bunbury)', 'Esperance Beach', 'Hillarys Boat Harbour', 'Swan Valley'],
    suburbs: ['Perth', 'Fremantle', 'Mandurah', 'Bunbury', 'Geraldton', 'Albany', 'Kalgoorlie', 'Broome', 'Margaret River', 'Joondalup', 'Rockingham', 'Armadale', 'Midland', 'Esperance'],
    deliveryDays: '2 to 4 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-sa',
    kind: 'state',
    name: 'SA',
    nameFull: 'South Australia',
    state: 'SA',
    title: 'South Australia',
    climate: "South Australia's mild Mediterranean climate makes spring (Sep-Nov) and autumn (Mar-May) ideal for outdoor reveals. Adelaide Hills and coastal areas like Glenelg are stunning year-round, while regional SA stays drier inland.",
    venues: ['Adelaide Botanic Garden', 'Glenelg Beach', 'Henley Beach', 'Adelaide Hills', 'McLaren Vale', 'Port Lincoln Foreshore', 'Whyalla Beachfront', 'Mt Gambier (Blue Lake)', 'Victor Harbor', 'Cleland Conservation Park'],
    suburbs: ['Adelaide', 'Glenelg', 'Adelaide Hills', 'Mt Barker', 'Mt Gambier', 'Whyalla', 'Port Lincoln', 'Murray Bridge', 'Victor Harbor', 'Port Augusta', 'Gawler', 'Salisbury', 'Marion', 'Tea Tree Gully'],
    deliveryDays: '2 to 3 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-tasmania',
    kind: 'state',
    name: 'Tasmania',
    nameFull: 'Tasmania',
    state: 'TAS',
    title: 'Tasmania',
    climate: "Tasmania's cool temperate climate makes summer (Dec-Feb) ideal for outdoor reveals. Autumn (Mar-May) is stunning with vibrant foliage from Hobart to Launceston. Always pack a layer — Tassie weather can change fast.",
    venues: ['Mount Wellington (Hobart)', 'Salamanca Place', 'Cataract Gorge (Launceston)', 'Royal Tasmanian Botanical Gardens', 'Sandy Bay Beach', 'Bellerive Beach', 'Cradle Mountain lookouts', 'Bay of Fires', 'Devonport Foreshore', 'Bicheno Beach'],
    suburbs: ['Hobart', 'Launceston', 'Devonport', 'Burnie', 'Glenorchy', 'Kingston', 'Sorell', 'New Norfolk', 'Ulverstone', 'Bridgewater', 'Brighton', 'George Town', 'Smithton', 'Queenstown'],
    deliveryDays: '3 to 5 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-act',
    kind: 'state',
    name: 'ACT',
    nameFull: 'Australian Capital Territory',
    state: 'ACT',
    title: 'ACT',
    climate: "Canberra and the ACT get warm dry spring (Oct-Nov) and autumn (Mar-Apr) days ideal for outdoor reveals. Cool clear winter days work beautifully too. Lake Burley Griffin and the National Arboretum are postcard-perfect backdrops.",
    venues: ['Lake Burley Griffin', 'Commonwealth Park', 'National Arboretum', 'Black Mountain Peninsula', 'Mount Ainslie Lookout', 'Stromlo Forest Park', 'Lake Tuggeranong', 'Weston Park', 'Telopea Park', 'Pine Island Reserve'],
    suburbs: ['Civic', 'Belconnen', 'Gungahlin', 'Tuggeranong', 'Woden', 'Manuka', 'Kingston', 'Braddon', 'Dickson', 'Yarralumla', 'Forrest', 'Queanbeyan', 'Jerrabomberra', 'Googong'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-nt',
    kind: 'state',
    name: 'NT',
    nameFull: 'Northern Territory',
    state: 'NT',
    title: 'Northern Territory',
    climate: "The NT's tropical climate means the dry season (May-Oct) is the perfect time for outdoor reveals. Warm sunny days and low humidity make any park or beach ideal. Wet season (Nov-Apr) reveals work best in covered venues.",
    venues: ['Mindil Beach (Darwin)', 'East Point Reserve', 'Lake Bennett', 'Casuarina Beach', 'Lee Point Beach', 'George Brown Botanic Gardens', 'Todd Mall (Alice Springs)', 'Telegraph Station (Alice Springs)', 'Bicentennial Park', 'Nightcliff Foreshore'],
    suburbs: ['Darwin', 'Alice Springs', 'Palmerston', 'Katherine', 'Tennant Creek', 'Nhulunbuy', 'Casuarina', 'Nightcliff', 'Larrakeyah', 'Stuart Park', 'Parap', 'Fannie Bay', 'Coconut Grove', 'Howard Springs'],
    deliveryDays: '3 to 6 days',
    fromGoldCoast: false,
  },

  // ============ REGIONAL (4) ============
  {
    handle: 'gender-reveal-ideas-central-coast',
    kind: 'region',
    name: 'Central Coast',
    nameFull: 'NSW Central Coast',
    state: 'NSW',
    title: 'Central Coast',
    climate: "The Central Coast's mild coastal climate makes outdoor reveals possible year-round. Spring (Sep-Nov) and autumn (Mar-May) offer the most comfortable temperatures with sunny days perfect for beach or lakefront reveals.",
    venues: ['Avoca Beach', 'Terrigal Beach', 'Forresters Beach', 'The Entrance Foreshore', 'Long Jetty', 'Toukley Foreshore', 'Bouddi National Park', 'Brisbane Water', 'Pearl Beach', 'Umina Beach'],
    suburbs: ['Gosford', 'Erina', 'Terrigal', 'Avoca Beach', 'The Entrance', 'Toukley', 'Wyong', 'Tuggerah', 'Woy Woy', 'Umina Beach', 'Ettalong', 'Bateau Bay', 'Killarney Vale', 'Long Jetty'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-geelong',
    kind: 'region',
    name: 'Geelong',
    nameFull: 'Geelong & Surf Coast',
    state: 'VIC',
    title: 'Geelong',
    climate: "Geelong's mild coastal climate is best for outdoor reveals in spring (Sep-Nov) and summer (Dec-Feb). The Surf Coast gets reliable sea breezes — pick early morning or sunset for the most flattering light.",
    venues: ['Eastern Beach', 'Cunningham Pier', 'Johnstone Park', 'Rippleside Park', 'Barwon Heads Beach', 'Torquay Front Beach', 'Anglesea Foreshore', 'Lorne Beach', 'Queenscliff Foreshore', 'You Yangs Lookout'],
    suburbs: ['Geelong CBD', 'Newtown', 'East Geelong', 'Highton', 'Belmont', 'Grovedale', 'Waurn Ponds', 'Ocean Grove', 'Barwon Heads', 'Torquay', 'Anglesea', 'Lorne', 'Drysdale', 'Lara'],
    deliveryDays: '1 to 2 days',
    fromGoldCoast: false,
  },
  {
    handle: 'gender-reveal-ideas-cairns',
    kind: 'region',
    name: 'Cairns',
    nameFull: 'Cairns & Tropical North QLD',
    state: 'QLD',
    title: 'Cairns',
    climate: "Cairns' tropical climate makes the dry season (May-Oct) ideal for outdoor reveals. Warm sunny days and low rainfall make beach and esplanade reveals stunning. Avoid the wet season (Nov-Apr) for outdoor events.",
    venues: ['Cairns Esplanade', 'Trinity Beach', 'Palm Cove', 'Yorkeys Knob', 'Holloways Beach', 'Cairns Botanic Gardens', 'Fogarty Park', 'Muddys Playground', 'Centenary Lakes', 'Crystal Cascades'],
    suburbs: ['Cairns City', 'Edge Hill', 'Trinity Beach', 'Palm Cove', 'Smithfield', 'Redlynch', 'Mooroobool', 'Manunda', 'Westcourt', 'Whitfield', 'Earlville', 'Bungalow', 'Manoora', 'Bayview Heights'],
    deliveryDays: '2 to 4 days',
    fromGoldCoast: true,
  },
  {
    handle: 'gender-reveal-ideas-launceston',
    kind: 'region',
    name: 'Launceston',
    nameFull: 'Launceston & Northern Tasmania',
    state: 'TAS',
    title: 'Launceston',
    climate: "Launceston's cool temperate climate makes summer (Dec-Feb) and early autumn (Mar) ideal for outdoor reveals. Cataract Gorge is stunning year-round but pack layers — northern Tassie weather changes fast.",
    venues: ['Cataract Gorge', 'City Park', 'Tamar Island Wetlands', 'Tailrace Park', 'Royal Park', 'Trevallyn Reserve', 'Punchbowl Reserve', 'Hollybank Reserve', 'Brady Lookout', 'Hadspen Riverside'],
    suburbs: ['Launceston CBD', 'East Launceston', 'West Launceston', 'Mowbray', 'Newnham', 'Riverside', 'Trevallyn', 'Kings Meadows', 'Norwood', 'Newstead', 'Prospect', 'Youngtown', 'Summerhill', 'Hadspen'],
    deliveryDays: '3 to 5 days',
    fromGoldCoast: false,
  },
]

export function buildSchema(a) {
  const url = `https://genderrevealideas.com.au/collections/${a.handle}`
  const areaServed = a.kind === 'state'
    ? { '@type': 'State', name: a.nameFull }
    : { '@type': 'City', name: a.name, containedInPlace: { '@type': 'State', name: a.nameFull } }
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': `${url}#localbusiness`,
        name: `Gender Reveal Ideas ${a.name}`,
        description: `${a.name}'s biggest range of gender reveal cannons, smoke bombs, powder blasters and sports reveals. Free express shipping across ${a.nameFull}.`,
        url,
        image: 'https://genderrevealideas.com.au/cdn/shop/files/GRI_Logo_Horizontal_Transparent_v2.png',
        logo: 'https://genderrevealideas.com.au/cdn/shop/files/GRI_Logo_Horizontal_Transparent_v2.png',
        telephone: '+61406860077',
        priceRange: '$15-$350',
        address: { '@type': 'PostalAddress', addressLocality: 'Gold Coast', addressRegion: 'QLD', addressCountry: 'AU' },
        areaServed,
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

export function buildLocationText(a) {
  const venuesList = a.venues.slice(0, 5).join(', ')
  const suburbsCount = a.suburbs.length
  return {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: `Planning your gender reveal party in ${a.name}? Look no further. Gender Reveal Ideas is Australia's #1 gender reveal store, trusted by over 70,000 families across ${a.nameFull} and beyond. Our locally-curated ${a.name} range includes smoke cannons, powder blasters, confetti poppers, sports reveals and balloon kits — everything you need to make your reveal moment unforgettable. From small family gatherings to big celebrations, our products are designed to bring excitement and joy to your day.` },
        ],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: `Why ${a.name} parents choose Gender Reveal Ideas: ${a.climate} Popular ${a.name} reveal venues include ${venuesList}, plus another ${a.venues.length - 5}+ public parks and beaches throughout the region. All our products are Australian-safety-tested, 100% eco-friendly, biodegradable, and leave no trace behind — so you can celebrate at any ${a.name} park or beach with full confidence.` },
        ],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: `${a.name} delivery: orders ship same-day from our Gold Coast warehouse. Express delivery to ${a.name} arrives in ${a.deliveryDays}. We deliver to ${suburbsCount}+ ${a.name} locations including ${a.suburbs.slice(0, 6).join(', ')} and surrounding areas. Free shipping on orders over $150. Rated ${REVIEW_DATA.ratingValue}/5 from ${REVIEW_DATA.reviewCount}+ Australian customer reviews verified by Judge.me.` },
        ],
      },
    ],
  }
}

export function buildMetaDescription(a) {
  return `${a.name}'s biggest range of gender reveal ideas with ${a.deliveryDays} delivery${a.fromGoldCoast ? ' from the Gold Coast' : ''}. Cannons, smoke bombs, powder blasters and sports reveals. ${REVIEW_DATA.ratingValue}★ from ${REVIEW_DATA.reviewCount}+ reviews. Eco friendly. Free shipping.`
}

export function buildTitleTag(a) {
  return `Gender Reveal Ideas ${a.name} | ${a.title}'s #1 Range | ${REVIEW_DATA.ratingValue}★ Reviews`
}
