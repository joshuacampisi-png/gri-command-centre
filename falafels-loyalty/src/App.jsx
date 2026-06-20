import React, { useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';
import AuthScreen from './components/AuthScreen.jsx';
import Dashboard from './components/Dashboard.jsx';
import Toast from './components/Toast.jsx';

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
      .then(({ user }) => setUser(user))
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
        <div className="logo-box small"><span>Fala</span><span>Fels</span></div>
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
      {toast && <Toast key={toast.id} toast={toast} onDone={() => setToast(null)} />}
    </>
  );
}
