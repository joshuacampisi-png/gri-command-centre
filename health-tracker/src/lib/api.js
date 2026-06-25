// Thin wrapper around the backend. Cookies (auth) are sent automatically.
async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  state: () => req('GET', '/api/state'),
  login: (pin) => req('POST', '/api/login', { pin }),
  logout: () => req('POST', '/api/logout'),
  status: () => req('GET', '/api/status'),
  connect: (token) => req('POST', '/api/connect', { token }),
  disconnect: () => req('DELETE', '/api/connect'),
  oura: (days = 14) => req('GET', `/api/oura?days=${days}`),
  bloods: () => req('GET', '/api/bloods'),
  addBloods: (results) => req('POST', '/api/bloods', { results }),
  deleteBlood: (id) => req('DELETE', `/api/bloods/${id}`),
};
