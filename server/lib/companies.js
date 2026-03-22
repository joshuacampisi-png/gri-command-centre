export const COMPANIES = ['Lionzen', 'GRI', 'GBU']

export function normalizeCompany(value) {
  if (!value) return 'Lionzen'
  const found = COMPANIES.find(c => c.toLowerCase() === String(value).toLowerCase())
  return found || 'Lionzen'
}
