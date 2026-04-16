import { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../services/api';

const AuthContext = createContext({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true
});

const STORAGE_KEY = 'autosphere_auth';

// Initialize auth state from localStorage synchronously
const getStoredAuth = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.token && parsed.user) {
        return { token: parsed.token, user: parsed.user };
      }
    }
  } catch (error) {
    // Invalid stored data, clear it
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return { token: null, user: null };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getStoredAuth().user);
  const [token, setToken] = useState(() => getStoredAuth().token);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize auth state from localStorage
    const stored = getStoredAuth();
    if (stored.token && stored.user) {
      setUser(stored.user);
      setToken(stored.token);
    } else {
      setUser(null);
      setToken(null);
    }
    setIsLoading(false);

    // Listen for logout events from API interceptor
    const handleLogout = () => {
      setUser(null);
      setToken(null);
      // Use window.location for navigation to avoid router dependency
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const login = async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password });
    const { token: jwt, user: userPayload } = response.data.data;

    const authState = {
      token: jwt,
      user: userPayload
    };

    setUser(authState.user);
    setToken(authState.token);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(authState));

    const dashboardPath = getDashboardPath(authState.user.role);
    window.location.href = dashboardPath;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.href = '/login';
  };

  const contextValue = {
    user,
    token,
    login,
    logout,
    isLoading
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  // Check if we're using the default context (not provided by AuthProvider)
  if (!ctx || typeof ctx.login !== 'function') {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};

const getDashboardPath = (role) => {
  switch (role) {
    case 'vehicle_owner':
      return '/dashboard/owner';
    case 'buyer':
      return '/dashboard/buyer';
    case 'workshop':
      return '/dashboard/workshop';
    case 'admin':
      return '/dashboard/admin';
    default:
      return '/dashboard/owner';
  }
};

