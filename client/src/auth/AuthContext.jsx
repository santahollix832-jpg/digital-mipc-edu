import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/config';

const AuthContext = createContext(null);

async function requestAuth(path, options = {}) {
  const response = await apiFetch(`/auth${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();

  if (!response.ok) {
    const error = new Error(result.error || 'Authentication request failed.');
    error.status = response.status;
    throw error;
  }
  return result;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let active = true;
    requestAuth('/me')
      .then(result => {
        if (active) setUser(result.user);
      })
      .catch(error => {
        if (active) {
          setUser(null);
          setAuthError(error.status === 401
            ? ''
            : 'Unable to verify your session. Check the server connection and sign in again.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    authError,
    async login(username, password) {
      const result = await requestAuth('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setUser(result.user);
      setAuthError('');
      return result.user;
    },
    async createAccount(account) {
      return requestAuth('/register', {
        method: 'POST',
        body: JSON.stringify(account),
      });
    },
    async logout() {
      await requestAuth('/logout', { method: 'POST' });
      setUser(null);
    },
  }), [user, loading, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
