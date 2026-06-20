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

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null); // Android/Chrome install event
  const [show, setShow] = useState(false);
  const [iosSteps, setIosSteps] = useState(false);
  const ios = isiOS();

  useEffect(() => {
    if (isStandalone() || snoozedRecently()) return;

    // Android / desktop Chrome: capture the native install opportunity.
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    const onInstalled = () => {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
      setShow(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari never fires beforeinstallprompt, so offer it ourselves.
    let t;
    if (ios) t = setTimeout(() => setShow(true), 2200);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
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
      setIosSteps(true); // can't auto-install on iOS — show the manual steps
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
              Pop Falafels Loyalty on your home screen — one tap to open your coffee
              card, and you stay signed in.
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
              <li>Tap the <strong>Share</strong> button (the square with an arrow ↑) in Safari’s bar</li>
              <li>Scroll down and tap <strong>“Add to Home Screen”</strong></li>
              <li>Tap <strong>Add</strong> — then open Falafels from your home screen and sign in once</li>
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
