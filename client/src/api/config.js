// Centralized API configuration — prefer VITE_API_URL in production
const configuredHost = (import.meta.env.VITE_API_URL || 'http://localhost:5001')
  .replace(/\/+$/, '');

// API_HOST is the host root (no trailing slash, no /api suffix)
export const API_HOST = configuredHost.replace(/\/api\/?$/, '');

// API_BASE_URL points to the /api endpoint
export const API_BASE_URL = configuredHost.endsWith('/api')
  ? configuredHost
  : `${configuredHost}/api`;

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

// Return a fully-qualified URL for assets served from the backend (uploads, public files)
export function assetUrl(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  // Ensure leading slash
  const normalized = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `${API_HOST}${normalized}`;
}
