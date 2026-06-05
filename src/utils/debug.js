const KEY = 'npbinfo_debug';

export function syncDebugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('debug');
  if (v === '1') localStorage.setItem(KEY, '1');
  else if (v === '0') localStorage.removeItem(KEY);
}

export function isDebugMode() {
  return localStorage.getItem(KEY) === '1';
}
