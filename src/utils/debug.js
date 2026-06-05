const KEY = 'npbinfo_debug';
const BUILD_INFO = {
  buildId: __NPBINFO_BUILD_ID__,
  buildTime: __NPBINFO_BUILD_TIME__,
  gitRevision: __NPBINFO_GIT_REVISION__,
};

export function syncDebugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('debug');
  if (v === '1') localStorage.setItem(KEY, '1');
  else if (v === '0') localStorage.removeItem(KEY);
}

export function isDebugMode() {
  return localStorage.getItem(KEY) === '1';
}

export function getBuildInfo() {
  return BUILD_INFO;
}

export function withNoCache(url) {
  if (!isDebugMode()) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}nocache=1&t=${Date.now()}`;
}
