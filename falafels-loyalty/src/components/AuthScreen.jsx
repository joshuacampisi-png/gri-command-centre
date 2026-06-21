import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import wordmark from '../assets/wordmark.png';
import team from '../assets/team-cutout.png';
import './AuthScreen.css';

const LAST_USER_KEY = 'falafels_last_user';

/* Inline Lucide-style icons (1.7–1.8 stroke, currentColor). */
function ArrowRight() {
  return (
    <svg
      className="af-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.06 12.34a1 1 0 0 1 0-.68C3.42 7.94 7.36 5 12 5s8.58 2.94 9.94 6.66a1 1 0 0 1 0 .68C20.58 16.06 16.64 19 12 19s-8.58-2.94-9.94-6.66Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.64 0 8.58 2.94 9.94 6.66a1 1 0 0 1 0 .68 11.7 11.7 0 0 1-2.17 3.51" />
      <path d="M6.61 6.61A12 12 0 0 0 2.06 11.66a1 1 0 0 0 0 .68C3.42 16.06 7.36 19 12 19a10.5 10.5 0 0 0 5.39-1.45" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

export default function AuthScreen({ onAuthed, showToast }) {
  const [mode, setMode] = useState('signup'); // 'signup' | 'login'
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  // Prefill the name for returning users so they don't retype it.
  useEffect(() => {
    const last = localStorage.getItem(LAST_USER_KEY);
    if (last) setName(last);
  }, []);

  const isSignup = mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const fn = isSignup ? api.signup : api.login;
      const res = await fn(name.trim(), password);
      localStorage.setItem(LAST_USER_KEY, name.trim());
      onAuthed(res.token, res.user);
      if (isSignup && res.signupBonus) {
        showToast(`Welcome in. +${res.signupBonus} Falafel Coins to start`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setMode(isSignup ? 'login' : 'signup');
  }

  return (
    <div className="af-screen">
      {/* ── Scene (pure CSS, full bleed) ───────────────────────────── */}
      <div className="af-scene" aria-hidden="true">
        <div className="af-scene__base" />

        <div className="af-scene__dof">
          <div className="af-wash" />
          <div className="af-shelf" />
          <div className="af-bottles">
            <span style={{ '--h': '34px', '--w': '12px', '--c': 'rgba(214,158,92,0.5)' }} />
            <span style={{ '--h': '46px', '--w': '14px', '--c': 'rgba(122,150,170,0.45)' }} />
            <span style={{ '--h': '28px', '--w': '16px', '--c': 'rgba(214,158,92,0.42)' }} />
            <span style={{ '--h': '52px', '--w': '11px', '--c': 'rgba(122,150,170,0.5)' }} />
            <span style={{ '--h': '38px', '--w': '15px', '--c': 'rgba(214,158,92,0.48)' }} />
            <span style={{ '--h': '44px', '--w': '13px', '--c': 'rgba(122,150,170,0.42)' }} />
            <span style={{ '--h': '30px', '--w': '17px', '--c': 'rgba(214,158,92,0.5)' }} />
            <span style={{ '--h': '50px', '--w': '12px', '--c': 'rgba(122,150,170,0.46)' }} />
            <span style={{ '--h': '36px', '--w': '14px', '--c': 'rgba(214,158,92,0.44)' }} />
            <span style={{ '--h': '42px', '--w': '13px', '--c': 'rgba(122,150,170,0.5)' }} />
          </div>

          <div className="af-pendant af-pendant--left">
            <span className="af-pendant__line" />
            <span className="af-pendant__bulb" />
          </div>
          <div className="af-pendant af-pendant--right">
            <span className="af-pendant__line" />
            <span className="af-pendant__bulb" />
          </div>

          <div className="af-orb" />
          <div className="af-counter-glow" />
        </div>

        <div className="af-subject-darken" />
        <div className="af-lower-fade" />
        <div className="af-vignette" />
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="af-content">
        <img className="af-wordmark" src={wordmark} alt="Fala Fels Loyalty" />

        <div className="af-hero">
          <img src={team} alt="The Fala Fels team holding a coffee and a falafel roll" />
        </div>

        <form className="af-form" onSubmit={submit} noValidate>
          <p className="af-eyebrow">Fala Fels &middot; Loyalty</p>

          <h1 className="af-title">
            {isSignup ? (
              <>
                Good coffee, <em>remembered.</em>
              </>
            ) : (
              <>
                Welcome <em>back.</em>
              </>
            )}
          </h1>

          <p className="af-sub">Stamp daily for free coffee and money vouchers.</p>

          <div className="af-fields">
            <label className="af-field">
              <span className="af-label">Your name</span>
              <span className="af-shell">
                <input
                  className="af-input"
                  type="text"
                  name="username"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Josh"
                  autoComplete="username"
                  autoCapitalize="words"
                  required
                />
              </span>
            </label>

            <label className="af-field">
              <span className="af-label">Password</span>
              <span className="af-shell">
                <input
                  className="af-input"
                  type={showPw ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? 'Create a password' : 'Enter your password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="af-eye"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                >
                  {showPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </span>
            </label>
          </div>

          <button className="af-submit" type="submit" disabled={busy}>
            {busy ? (
              <span>One moment&hellip;</span>
            ) : (
              <>
                <span>{isSignup ? 'Create my card' : 'Sign in'}</span>
                <ArrowRight />
              </>
            )}
          </button>

          <p className="af-foot">
            {isSignup ? 'Already a member? ' : 'New here? '}
            <button type="button" className="af-link" onClick={toggleMode}>
              {isSignup ? 'Sign in' : 'Create a card'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
