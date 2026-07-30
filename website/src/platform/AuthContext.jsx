import { createContext, useContext, useState, useEffect } from 'react';
import { platformLogin as apiLogin } from './api';

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return !payload.exp || payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

const AuthContext = createContext(null);

export function PlatformAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('platform_token');
    const stored = localStorage.getItem('platform_user');
    if (token && stored && !isTokenExpired(token)) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('platform_token');
        localStorage.removeItem('platform_user');
      }
    } else if (token) {
      // Token is expired or invalid — clear storage
      localStorage.removeItem('platform_token');
      localStorage.removeItem('platform_user');
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await apiLogin(email, password);
    const { token, user: userData } = res.data;
    localStorage.setItem('platform_token', token);
    localStorage.setItem('platform_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('platform_token');
    localStorage.removeItem('platform_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function usePlatformAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('usePlatformAuth must be used within PlatformAuthProvider');
  return ctx;
}
