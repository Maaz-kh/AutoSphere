import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? (import.meta.env.VITE_API_BASE_URL.endsWith('/api')
      ? import.meta.env.VITE_API_BASE_URL
      : `${import.meta.env.VITE_API_BASE_URL}/api`)
  : '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false
});

// Add request interceptor for auth token
apiClient.interceptors.request.use(
  (config) => {
    const stored = localStorage.getItem('autosphere_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.token) {
          config.headers.Authorization = `Bearer ${parsed.token}`;
        }
      } catch (error) {
        // Invalid stored data, ignore
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth data on unauthorized
      localStorage.removeItem('autosphere_auth');
      // Dispatch custom event to notify AuthContext
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(error);
  }
);

// Export app URL for generating absolute URLs (e.g., email verification links)
export const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

