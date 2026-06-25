import React from 'react';
import { Card } from '../components/ui.jsx';
import { api } from '../lib/api';

export default function Settings({ oura, onBack, onDisconnect, onLogout }) {
  const { data, error } = oura;

  async function disconnect() {
    if (!window.confirm('Disconnect Oura? Removes the saved token. Her blood results stay.')) return;
    await api.disconnect();
    onDisconnect();
  }

  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="page">
      <button className="back" onClick={onBack}>
        ‹ Back
      </button>
      <h1>Settings</h1>

      <Card style={{ marginTop: 16 }}>
        <div className="label">Oura connection</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {error ? 'Reconnect needed' : data ? 'Connected' : 'Connecting…'}
        </div>
        {data?.info?.email ? <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 4 }}>{data.info.email}</div> : null}
        {data?.fetchedAt ? (
          <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 4 }}>
            Last synced {new Date(data.fetchedAt).toLocaleString('en-AU')}
          </div>
        ) : null}
        <button className="btn danger" style={{ marginTop: 16 }} onClick={disconnect}>
          Disconnect Oura
        </button>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <div className="label">Security</div>
        <button className="btn ghost" onClick={logout}>
          Lock app (sign out)
        </button>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <div className="label">About</div>
        <p style={{ color: 'var(--dim)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Vitals reads live data from the Oura Ring API and stores her blood results privately on the
          server behind a PIN. Reference ranges are general adult guides and vary by lab — always
          defer to the ranges on her actual pathology report.
        </p>
      </Card>
    </div>
  );
}
