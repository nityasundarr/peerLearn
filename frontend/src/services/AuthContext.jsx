import { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

const TOKEN_KEY = 'access_token';

const AuthContext = createContext({});

// Decode JWT payload (no verification — backend validates on each request)
function parseJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Build user object from JWT payload
function userFromPayload(payload) {
  if (!payload?.sub) return null;
  const isExpired = payload.exp && payload.exp * 1000 < Date.now();
  if (isExpired) return null;
  return {
    id: payload.sub,
    email: payload.email ?? '',
    full_name: payload.full_name ?? '',
    roles: payload.roles ?? [],
  };
}

// Hook for components to access auth
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const restoreSession = () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setSession(null);
      setLoading(false);
      return;
    }
    const payload = parseJwtPayload(token);
    const u = userFromPayload(payload);
    if (!u) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('refresh_token');
      setUser(null);
      setSession(null);
    } else {
      setUser(u);
      setSession({ access_token: token });
    }
    setLoading(false);
  };

  useEffect(() => {
    restoreSession();
  }, []);

  const signUp = async (email, password, metadata = {}) => {
    try {
      const { data } = await api.post('/auth/register', {
        email,
        password,
        full_name: metadata.full_name ?? '',
        preferred_language: metadata.preferred_language ?? 'English',
      });
      return { data, error: null };
    } catch (err) {
      const d = err.response?.data?.detail;
      const message = Array.isArray(d) ? d.map((e) => e.msg ?? e).join(', ') : (d ?? err.message ?? 'Registration failed');
      return { data: null, error: { message } };
    }
  };

  const signIn = async (email, password) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const token = data.access_token;
      if (!token) {
        return { data: null, error: { message: 'No token in response' } };
      }
      localStorage.setItem(TOKEN_KEY, token);
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      const payload = parseJwtPayload(token);
      const u = userFromPayload(payload);
      setUser(u);
      setSession({ access_token: token });
      return { data: { user: u, session: { access_token: token } }, error: null };
    } catch (err) {
      const d = err.response?.data?.detail;
      const message = Array.isArray(d) ? d.map((e) => e.msg ?? e).join(', ') : (d ?? err.message ?? 'Login failed');
      return { data: null, error: { message } };
    }
  };

  const signOut = async () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('refresh_token');
    setUser(null);
    setSession(null);
    return { error: null };
  };

  const resetPassword = async (email) => {
    try {
      await api.post('/auth/forgot-password', { email });
      return { data: {}, error: null };
    } catch (err) {
      const d = err.response?.data?.detail;
      const message = Array.isArray(d) ? d.map((e) => e.msg ?? e).join(', ') : (d ?? err.message ?? 'Request failed');
      return { data: null, error: { message } };
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      await api.post('/auth/change-password', { new_password: newPassword });
      return { data: {}, error: null };
    } catch (err) {
      const d = err.response?.data?.detail;
      const message = Array.isArray(d) ? d.map((e) => e.msg ?? e).join(', ') : (d ?? err.message ?? 'Update failed');
      return { data: null, error: { message } };
    }
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
