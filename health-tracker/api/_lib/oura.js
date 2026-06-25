// Oura Ring API v2 access, shared by the serverless functions and local server.
const OURA_BASE = 'https://api.ouraring.com/v2/usercollection';

export async function ouraGet(token, pathName, params = {}) {
  let out = [];
  let next = null;
  let guard = 0;
  do {
    const qs = new URLSearchParams(next ? { ...params, next_token: next } : params).toString();
    const res = await fetch(`${OURA_BASE}/${pathName}${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = new Error(`Oura ${pathName} ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    if (Array.isArray(json.data)) {
      out = out.concat(json.data);
      next = json.next_token;
    } else {
      return json; // single object (e.g. personal_info)
    }
    guard += 1;
  } while (next && guard < 20);
  return out;
}

export function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export async function fetchAllOura(token, days) {
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const s = isoDate(start);
  const e = isoDate(new Date());
  const range = { start_date: s, end_date: e };

  const safe = (p) => p.then((d) => d).catch((err) => ({ __error: err.status || err.message }));
  const list = (x) => (Array.isArray(x) ? x : []);

  const [
    sleepDaily, sleepDetail, readiness, activity, stress, spo2,
    resilience, cardioAge, vo2, workouts, info,
  ] = await Promise.all([
    safe(ouraGet(token, 'daily_sleep', range)),
    safe(ouraGet(token, 'sleep', range)),
    safe(ouraGet(token, 'daily_readiness', range)),
    safe(ouraGet(token, 'daily_activity', range)),
    safe(ouraGet(token, 'daily_stress', range)),
    safe(ouraGet(token, 'daily_spo2', range)),
    safe(ouraGet(token, 'daily_resilience', range)),
    safe(ouraGet(token, 'daily_cardiovascular_age', range)),
    safe(ouraGet(token, 'vO2_max', range)),
    safe(ouraGet(token, 'workout', range)),
    safe(ouraGet(token, 'personal_info')),
  ]);

  return {
    fetchedAt: Date.now(),
    window: { start: s, end: e, days },
    info: info && !info.__error ? info : null,
    sleepDaily: list(sleepDaily),
    sleepDetail: list(sleepDetail),
    readiness: list(readiness),
    activity: list(activity),
    stress: list(stress),
    spo2: list(spo2),
    resilience: list(resilience),
    cardioAge: list(cardioAge),
    vo2: list(vo2),
    workouts: list(workouts),
  };
}
