import React, { useEffect, useState } from 'react';
import logo from '../assets/logo.png';

const SNOOZE_KEY = 'falafels_a2hs_snooze';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // don't nag — re-ask after a week

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}
function isiOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
}
function snoozedRecently() {
  const t = Number(localStorage.getItem(SNOOZE_KEY) || 0);
  return t > 0 && Date.now() - t < SNOOZE_MS;
}

// The iOS Share glyph, so the walkthrough points at the real button.
function ShareGlyph() {
  return (
    <span className="a2hs-share-ico">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 15V3" />
        <path d="m8 7 4-4 4 4" />
        <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      </svg>
    </span>
  );
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null); // Android/Chrome install event
  const [show, setShow] = useState(false);
  const [iosSteps, setIosSteps] = useState(false);
  const ios = isiOS();

  useEffect(() => {
    // Android / desktop Chrome: capture the native install opportunity.
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      if (!isStandalone() && !snoozedRecently()) setShow(true);
    };
    const onInstalled = () => {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
      setShow(false);
    };
    // The Profile "Add to home screen" button summons this on demand,
    // ignoring the snooze.
    const onForce = () => {
      if (isStandalone()) return;
      setIosSteps(false);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('falafels-install', onForce);

    // iOS Safari never fires beforeinstallprompt, so offer it ourselves.
    let t;
    if (ios && !isStandalone() && !snoozedRecently()) {
      t = setTimeout(() => setShow(true), 2400);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('falafels-install', onForce);
      if (t) clearTimeout(t);
    };
  }, [ios]);

  function snooze() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setShow(false);
  }

  async function add() {
    if (deferred) {
      deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {
        /* ignore */
      }
      setDeferred(null);
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
      setShow(false);
    } else if (ios) {
      setIosSteps(true); // can't auto-install on iOS — walk them through it
    } else {
      // Desktop/Android without a captured prompt (already installable later):
      setIosSteps(true);
    }
  }

  if (!show) return null;

  return (
    <div className="a2hs-overlay" onClick={snooze}>
      <div className="a2hs-sheet" onClick={(e) => e.stopPropagation()}>
        <img className="a2hs-logo" src={logo} alt="Fala Fels Loyalty" />

        {!iosSteps ? (
          <>
            <h3 className="a2hs-title">Add this as an app</h3>
            <p className="a2hs-text">
              Keep Fala Fels on your home screen — one tap to open your coffee card,
              and you stay signed in.
            </p>
            <div className="a2hs-actions">
              <button className="a2hs-no" onClick={snooze}>Not now</button>
              <button className="a2hs-yes" onClick={add}>
                {ios ? 'Show me how' : 'Yes, add it'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="a2hs-title">Add to Home Screen</h3>
            <ol className="a2hs-steps">
              <li>Tap the <strong>Share</strong> button <ShareGlyph /> in {ios ? "Safari's" : "your browser's"} toolbar</li>
              <li>Scroll down and tap <strong>“Add to Home Screen”</strong></li>
              <li>Tap <strong>Add</strong> — then open Fala Fels from your home screen and sign in once</li>
            </ol>
            <div className="a2hs-actions">
              <button className="a2hs-yes" onClick={snooze}>Got it</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
