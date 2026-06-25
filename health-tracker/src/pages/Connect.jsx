import React, { useState } from 'react';
import { api } from '../lib/api';

export default function Connect({ onConnected }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function connect(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.connect(token.trim());
      onConnected();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Connect her Oura Ring</h1>
      <p className="sub">Vitals reads sleep, readiness, stress and body data straight from Oura.</p>

      <div className="card">
        <div className="steps">
          <Step n="1" t="Sign in to the Oura web dashboard with her account." />
          <Step n="2" t="Open Personal Access Tokens and create a new token." />
          <Step n="3" t="Copy it and paste it below." />
        </div>
        <a href="https://cloud.ouraring.com/personal-access-tokens" target="_blank" rel="noreferrer">
          Open Oura token page ↗
        </a>

        <form onSubmit={connect} style={{ marginTop: 16 }}>
          <input
            className="input"
            type="password"
            placeholder="Paste Oura Personal Access Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            style={{ marginBottom: 12 }}
          />
          {error ? <div className="err">{error}</div> : null}
          <button className="btn" type="submit" disabled={busy || !token}>
            {busy ? 'Verifying…' : 'Connect'}
          </button>
        </form>

        <p className="fine">
          The token is stored on the server only and used to talk to Oura on her behalf — it is never
          exposed in the browser.
        </p>
      </div>
    </div>
  );
}

function Step({ n, t }) {
  return (
    <div className="step">
      <div className="n">{n}</div>
      <div>{t}</div>
    </div>
  );
}
