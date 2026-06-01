/** Query keys that must never remain in the browser URL. */
const SENSITIVE_QUERY_KEYS = new Set([
  'email',
  'password',
  'passwordconfirm',
  'passwd',
  'pwd',
  'access_token',
  'refresh_token'
]);

/**
 * Remove credential-like params from the current URL without reloading.
 * @returns {boolean} true if the URL was changed
 */
export function sanitizeLocationUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return false;
  const query = url.searchParams.toString();
  const next = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
  history.replaceState(null, '', next);
  return true;
}

/** Build an in-app route URL without preserving stale query strings. */
export function appRouteUrl(pathname, hash = '') {
  return `${pathname}${hash || ''}`;
}

/** Drop the entire query string (after auth callback handling). */
export function clearUrlSearch() {
  if (!window.location.search) return false;
  history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
  return true;
}
