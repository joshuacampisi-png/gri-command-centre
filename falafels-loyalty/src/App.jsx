import React, { useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';
import AuthScreen from './components/AuthScreen.jsx';
import Dashboard from './components/Dashboard.jsx';
import Toast from './components/Toast.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import logo from './assets/logo.png';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, kind = 'info') => {
    setToast({ message, kind, id: Date.now() });
  }, []);

  // Restore session on load.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user, token }) => {
        if (token) setToken(token); // sliding session — keep them logged in
        setUser(user);
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  function handleAuthed(token, user) {
    setToken(token);
    setUser(user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  if (loading) {
    return (
      <div className="splash-loading">
        <img className="splash-logo" src={logo} alt="Fala Fels Loyalty" />
      </div>
    );
  }

  return (
    <>
      {user ? (
        <Dashboard user={user} setUser={setUser} onLogout={logout} showToast={showToast} />
      ) : (
        <AuthScreen onAuthed={handleAuthed} showToast={showToast} />
      )}
      {/* Home-screen install prompt — shows once the customer is in the app
          (so on Android the install carries their logged-in session). */}
      {user && <InstallPrompt />}
      {toast && <Toast key={toast.id} toast={toast} onDone={() => setToast(null)} />}
    </>
  );
}
