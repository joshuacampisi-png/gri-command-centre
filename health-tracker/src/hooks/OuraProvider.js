// Shares one Oura data load across all tabs (avoids each screen refetching).
import React, { createContext, useContext, useState } from 'react';
import { useOura } from './useOura';

const OuraCtx = createContext(null);
const WindowCtx = createContext({ days: 14, setDays: () => {} });

export function OuraProvider({ token, children }) {
  const [days, setDays] = useState(14);
  const ouraState = useOura(token, days);
  return (
    <WindowCtx.Provider value={{ days, setDays }}>
      <OuraCtx.Provider value={ouraState}>{children}</OuraCtx.Provider>
    </WindowCtx.Provider>
  );
}

export function useOuraData() {
  const ctx = useContext(OuraCtx);
  if (!ctx) throw new Error('useOuraData must be used within OuraProvider');
  return ctx;
}

export function useWindow() {
  return useContext(WindowCtx);
}
