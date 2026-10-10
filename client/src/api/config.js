const configuredApiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api')
  .replace(/\/+$/, '');

export const API_BASE_URL = configuredApiBaseUrl.endsWith('/api')
  ? configuredApiBaseUrl
  : `${configuredApiBaseUrl}/api`;

export const API_CLIENT_CONFIG = Object.freeze({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/api/')
    ? path.slice(4)
    : path === '/api'
      ? ''
      : path;
  const route = normalizedPath
    ? (normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`)
    : '';
  return `${API_BASE_URL}${route}`;
}

export function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), {
    ...options,
    credentials: API_CLIENT_CONFIG.withCredentials ? 'include' : 'same-origin',
  });
}
