import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

// Loads aggregated Oura data from the backend, caching the last good payload
// in localStorage so the shell renders instantly on reopen.
const CACHE = 'vitals_oura_cache';

export function useOura(enabled, days) {
  const [data, setData] = useState(() => {
    try {
      const raw = localStorage.getItem(CACHE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.oura(days);
      if (id !== reqId.current) return;
      setData(payload);
      try {
        localStorage.setItem(CACHE, JSON.stringify(payload));
      } catch {
        // ignore quota
      }
    } catch (e) {
      if (id === reqId.current) setError(e.message || 'Failed to load Oura data');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [enabled, days]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
