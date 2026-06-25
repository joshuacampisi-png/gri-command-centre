// Loads and aggregates Oura data for a date window, with on-device caching so
// the dashboard still renders offline / between refreshes.
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { oura } from '../api/oura';
import { lastNDays, isoDate, daysAgo } from '../utils/dates';

const CACHE_KEY = 'oura_cache_v1';

async function readCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeCache(payload) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // best-effort cache
  }
}

// Fetch everything we need in parallel. Individual endpoint failures degrade
// gracefully (membership-gated data may 426) without sinking the whole load.
async function fetchAll(token, days) {
  const { start, end } = lastNDays(days);
  const startDT = daysAgo(1).toISOString();
  const endDT = new Date().toISOString();

  const safe = (p) => p.catch((e) => ({ __error: e.message }));

  const [
    sleepDaily,
    sleepDetail,
    readiness,
    activity,
    stress,
    spo2,
    resilience,
    cardioAge,
    vo2,
    workouts,
    heartrate,
    info,
  ] = await Promise.all([
    safe(oura.dailySleep(token, start, end)),
    safe(oura.sleep(token, start, end)),
    safe(oura.dailyReadiness(token, start, end)),
    safe(oura.dailyActivity(token, start, end)),
    safe(oura.dailyStress(token, start, end)),
    safe(oura.dailySpo2(token, start, end)),
    safe(oura.dailyResilience(token, start, end)),
    safe(oura.dailyCardiovascularAge(token, start, end)),
    safe(oura.vo2max(token, start, end)),
    safe(oura.workouts(token, start, end)),
    safe(oura.heartrate(token, startDT, endDT)),
    safe(oura.personalInfo(token)),
  ]);

  const list = (x) => (Array.isArray(x) ? x : []);

  return {
    fetchedAt: Date.now(),
    window: { start, end, days },
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
    heartrate: heartrate && heartrate.data ? heartrate.data : list(heartrate),
  };
}

export function useOura(token, days = 14) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(
    async ({ silent } = {}) => {
      if (!token) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const payload = await fetchAll(token, days);
        setData(payload);
        setFromCache(false);
        writeCache(payload);
      } catch (e) {
        const cached = await readCache();
        if (cached) {
          setData(cached);
          setFromCache(true);
        }
        setError(e.message || 'Failed to load Oura data');
      } finally {
        setLoading(false);
      }
    },
    [token, days]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const cached = await readCache();
      if (cached && active) {
        setData(cached);
        setFromCache(true);
        setLoading(false);
      }
      load({ silent: !!cached });
    })();
    return () => {
      active = false;
    };
  }, [load]);

  return { data, loading, error, fromCache, refresh: load };
}
