import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

let authTokenGetter = () => null;
let onUnauthorized = () => {};

export function setAuthTokenGetter(getter) {
  authTokenGetter = getter;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  const token = authTokenGetter();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const publicAuthPaths = [
      '/api/auth/login',
      '/api/auth/verify-otp',
      '/api/auth/resend-otp',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/auth/webauthn/authenticate',
    ];
    const isPublicAuth = publicAuthPaths.some((path) => url.includes(path));

    if (error.response?.status === 401 && !isPublicAuth) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export default api;
