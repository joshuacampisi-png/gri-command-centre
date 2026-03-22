const BASE = '/api'

export async function fetchDashboard(company = 'All') {
  const response = await fetch(`${BASE}/dashboard?company=${company}`)
  if (!response.ok) throw new Error(`Dashboard fetch failed: ${response.status}`)
  return response.json()
}

export async function fetchThemeAssets(themeId) {
  const r = await fetch(`${BASE}/shopify/dev/assets?themeId=${themeId}`)
  if (!r.ok) throw new Error(`Assets fetch failed: ${r.status}`)
  return r.json()
}

export async function fetchThemeAsset(themeId, key) {
  const r = await fetch(`${BASE}/shopify/dev/asset?themeId=${themeId}&key=${encodeURIComponent(key)}`)
  if (!r.ok) throw new Error(`Asset fetch failed: ${r.status}`)
  return r.json()
}

export async function saveThemeAsset(themeId, key, value) {
  const r = await fetch(`${BASE}/shopify/dev/asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ themeId, key, value })
  })
  if (!r.ok) throw new Error(`Asset save failed: ${r.status}`)
  return r.json()
}
