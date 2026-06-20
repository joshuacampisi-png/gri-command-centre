import React, { useState } from 'react';
import { api } from '../api.js';

export default function AuthScreen({ onAuthed, showToast }) {
  const [mode, setMode] = useState('signup'); // 'signup' | 'login'
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const fn = mode === 'signup' ? api.signup : api.login;
      const { token, user } = await fn(name.trim(), password);
      onAuthed(token, user);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-inner">
        <div className="logo-box"><span>Fala</span><span>Fels</span></div>

        <h1 className="auth-title">Falafels Loyalty</h1>
        <p className="auth-sub">
          Your coffee card, reimagined. Stamp every cup, build a streak,
          and earn Falafel Coins for free coffee. ☕
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Josh"
              autoComplete="username"
              autoCapitalize="words"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Keep it simple"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
            />
          </label>

          <button className="btn-primary big" type="submit" disabled={busy}>
            {busy ? 'One sec…' : mode === 'signup' ? 'Create my card' : 'Log in'}
          </button>
        </form>

        <button
          className="link-toggle"
          onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
        >
          {mode === 'signup' ? 'Already have a card? Log in' : 'New here? Create your card'}
        </button>

        <p className="auth-foot">Fala Fels · Mermaid Waters, QLD · @fala_fels</p>
      </div>
    </div>
  );
}
