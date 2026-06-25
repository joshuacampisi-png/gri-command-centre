import React, { useState, useEffect, useCallback } from 'react';
import { api } from './lib/api';
import { useOura } from './state/useOura';
import { Spinner } from './components/ui';
import Login from './pages/Login.jsx';
import Connect from './pages/Connect.jsx';
import Today from './pages/Today.jsx';
import Sleep from './pages/Sleep.jsx';
import Body from './pages/Body.jsx';
import Bloods from './pages/Bloods.jsx';
import BloodDetail from './pages/BloodDetail.jsx';
import BloodEntry from './pages/BloodEntry.jsx';
import Insights from './pages/Insights.jsx';
import Settings from './pages/Settings.jsx';
import TabBar from './components/TabBar.jsx';

export default function App() {
  const [boot, setBoot] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState('today');
  const [view, setView] = useState(null); // {name, ...params}
  const [days, setDays] = useState(14);
  const [bloods, setBloods] = useState([]);

  const oura = useOura(authed && connected, days);

  const loadBloods = useCallback(() => {
    if (!authed) return;
    api.bloods().then(setBloods).catch(() => {});
  }, [authed]);

  useEffect(() => {
    api
      .state()
      .then(async (s) => {
        if (s.authed) {
          setAuthed(true);
          const st = await api.status().catch(() => ({ connected: false }));
          setConnected(!!st.connected);
        }
      })
      .finally(() => setBoot(false));
  }, []);

  useEffect(() => {
    if (authed) loadBloods();
  }, [authed, loadBloods]);

  if (boot) {
    return (
      <div className="app">
        <Spinner />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="app">
        <Login
          onAuthed={(conn) => {
            setAuthed(true);
            setConnected(!!conn);
          }}
        />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="app">
        <Connect onConnected={() => setConnected(true)} />
      </div>
    );
  }

  const nav = {
    openEntry: () => setView({ name: 'entry' }),
    openMarker: (markerId) => setView({ name: 'marker', markerId }),
    openSettings: () => setView({ name: 'settings' }),
    goInsights: () => {
      setView(null);
      setTab('insights');
    },
    close: () => setView(null),
  };

  // Overlay views take over the screen.
  if (view?.name === 'entry') {
    return (
      <div className="app">
        <BloodEntry
          onClose={nav.close}
          onSaved={() => {
            loadBloods();
            nav.close();
          }}
        />
      </div>
    );
  }
  if (view?.name === 'marker') {
    return (
      <div className="app">
        <BloodDetail markerId={view.markerId} bloods={bloods} onBack={nav.close} onChanged={loadBloods} />
      </div>
    );
  }
  if (view?.name === 'settings') {
    return (
      <div className="app">
        <Settings
          oura={oura}
          onBack={nav.close}
          onDisconnect={() => {
            setConnected(false);
            nav.close();
          }}
          onLogout={() => {
            setAuthed(false);
            setConnected(false);
            nav.close();
          }}
        />
      </div>
    );
  }

  const common = { oura, bloods, days, setDays, nav };

  return (
    <div className="app">
      {tab === 'today' && <Today {...common} />}
      {tab === 'sleep' && <Sleep {...common} />}
      {tab === 'body' && <Body {...common} />}
      {tab === 'bloods' && <Bloods {...common} />}
      {tab === 'insights' && <Insights {...common} />}
      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}
