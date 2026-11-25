import axios from 'axios';
import { translate } from '../i18n/index.jsx';

export const TOKEN_KEY = 'uaf_access_token';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 45000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then((response) => {
        const token = response.data?.data?.accessToken;
        if (token) localStorage.setItem(TOKEN_KEY, token);
        return token;
      })
      .catch((error) => {
        localStorage.removeItem(TOKEN_KEY);
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthCall = ['/auth/login', '/auth/register', '/auth/refresh'].some((path) =>
      original?.url?.includes(path),
    );

    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        const token = await refreshSession();
        if (token) {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        }
      } catch {
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error, fallback = 'Something went wrong') {
  const message = error?.response?.data?.error?.message || error?.message || fallback;
  return translate(message);
}

export function fieldErrors(error) {
  const details = error?.response?.data?.error?.details;
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.map((item) => [item.path, translate(item.message)]));
}

export default api;
