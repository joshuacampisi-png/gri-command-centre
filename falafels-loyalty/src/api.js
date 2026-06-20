import { localDate } from './lib/streak.js';

const TOKEN_KEY = 'falafels_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export const api = {
  signup: (name, password) => request('/auth/signup', { method: 'POST', body: { name, password } }),
  login: (name, password) => request('/auth/login', { method: 'POST', body: { name, password } }),
  me: () => request('/me'),
  // Pass the phone's own local date so the streak is judged against the
  // customer's real day, not the server's timezone.
  buyCoffee: () => request('/coffee', { method: 'POST', body: { today: localDate() } }),
  claimFreeCoffee: () => request('/free-coffee/claim', { method: 'POST' }),
  // Cash-out also carries the device date so the server can enforce the
  // "streak day only" rule against the customer's real day.
  redeem: () => request('/redeem', { method: 'POST', body: { today: localDate() } }),
  useVoucher: (id) => request(`/voucher/${id}/use`, { method: 'POST' }),
};
