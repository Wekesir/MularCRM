/**
 * Return a same-app relative path from a `?next=` query value, or null if unsafe.
 * Rejects protocol-relative URLs, absolute URLs, and empty values.
 */
export function safeNextPath(raw) {
  if (raw == null) return null;
  let value = String(raw).trim();
  if (!value) return null;

  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }

  value = value.trim();
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.includes('://')) return null;
  if (value.includes('\\')) return null;

  return value;
}

/** Build `/login?next=...` for the current location (pathname + search). */
export function loginPathWithNext(pathname, search = '') {
  const path = `${pathname || '/'}${search || ''}`;
  return `/login?next=${encodeURIComponent(path)}`;
}
