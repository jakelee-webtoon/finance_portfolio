export function parseStoredJson<T>(stored: string | null, fallback: T): T {
  if (stored === null) return fallback;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}
