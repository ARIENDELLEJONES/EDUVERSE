const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('eduverse_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = { success: res.ok, message: text || res.statusText };
    }
    if (!res.ok) {
      return {
        ...data,
        success: false,
        message: data.message || data.error || `Request failed (${res.status})`,
        status: res.status
      };
    }
    return data;
  } catch (err) {
    return { success: false, message: err.message || 'Network error' };
  }
}

export const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, data) => request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data) => request(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  del: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export function setToken(token) {
  if (token) localStorage.setItem('eduverse_token', token);
  else localStorage.removeItem('eduverse_token');
}

export function getToken() {
  return localStorage.getItem('eduverse_token');
}

export function setUser(user) {
  if (user) localStorage.setItem('eduverse_user', JSON.stringify(user));
  else localStorage.removeItem('eduverse_user');
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem('eduverse_user')); } catch { return null; }
}

export function logout() {
  api.post('/auth/logout');
  localStorage.removeItem('eduverse_token');
  localStorage.removeItem('eduverse_user');
  localStorage.removeItem('eduverse_mode');
}

export async function downloadFile(url, filename) {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
