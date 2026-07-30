const MAX_RECENT = 8;

export function getRecentSearches(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {
    return [];
  }
}

export function addRecentSearch(storageKey, item) {
  const recent = getRecentSearches(storageKey);
  const filtered = recent.filter(
    (r) => !(r.id === item.id && r.type === item.type),
  );
  const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
  localStorage.setItem(storageKey, JSON.stringify(updated));
  return updated;
}

export function clearRecentSearches(storageKey) {
  localStorage.removeItem(storageKey);
  return [];
}
