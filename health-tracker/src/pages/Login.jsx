import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Login({ onAuthed }) {
  const [hasPin, setHasPin] = useState(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.state().then((s) => setHasPin(s.hasPin)).catch(() => setHasPin(false));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (pin.length < 4) return setError('PIN must be at least 4 digits.');
    if (!hasPin && pin !== confirm) return setError('PINs do not match.');
    setBusy(true);
    try {
      const res = await api.login(pin);
      onAuthed(res.connected);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 style={{ fontSize: 40, marginTop: 60 }}>Vitals</h1>
      <p className="sub">Everything her body is telling her — in one place.</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{hasPin ? 'Enter PIN' : 'Create a PIN'}</h2>
        <p className="sub" style={{ marginBottom: 16 }}>
          {hasPin
            ? 'This keeps her health data private on this device.'
            : 'Set a PIN to protect her health data. You only do this once.'}
        </p>
        <form onSubmit={submit}>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            style={{ marginBottom: 12 }}
          />
          {!hasPin ? (
            <input
              className="input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Confirm PIN"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          {error ? <div className="err">{error}</div> : null}
          <button className="btn" type="submit" disabled={busy || pin.length < 4} style={{ marginTop: 6 }}>
            {busy ? 'Please wait…' : hasPin ? 'Unlock' : 'Set PIN & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
