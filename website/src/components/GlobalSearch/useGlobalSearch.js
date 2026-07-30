import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getRecentSearches, addRecentSearch as addRecent, clearRecentSearches as clearRecent } from './searchUtils';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

export function useGlobalSearch({ apiSearchFn, navItems, storageKey }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [apiResults, setApiResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState(() => getRecentSearches(storageKey));

  const timerRef = useRef(null);
  const abortRef = useRef(null);

  // Store latest apiSearchFn and navItems in refs so effects don't
  // re-fire when the parent creates new function/array references.
  const apiSearchFnRef = useRef(apiSearchFn);
  const navItemsRef = useRef(navItems);
  useEffect(() => { apiSearchFnRef.current = apiSearchFn; }, [apiSearchFn]);
  useEffect(() => { navItemsRef.current = navItems; }, [navItems]);

  // ── Keyboard shortcut: Cmd+K / Ctrl+K ──────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Reset on close ─────────────────────────────
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      setApiResults([]);
      setLoading(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    }
  }, [open]);

  // ── Client-side nav filtering (instant) ────────
  const navResults = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return navItems
      .filter(
        (item) =>
          item.label.toLowerCase().includes(lower) ||
          item.keywords?.some((k) => k.includes(lower)),
      )
      .slice(0, 5);
  }, [query, navItems]);

  // ── Debounced API search ───────────────────────
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setApiResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await apiSearchFnRef.current(trimmed, controller.signal);
        if (!controller.signal.aborted) {
          setApiResults(res?.data?.results || []);
          setLoading(false);
        }
      } catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setApiResults([]);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  // ── Build flat result list for keyboard nav ────
  const allResults = useMemo(() => {
    const items = [];

    if (navResults.length > 0) {
      items.push({ type: 'header', label: 'Pages' });
      navResults.forEach((n) => items.push({ type: 'nav', ...n }));
    }

    apiResults.forEach((group) => {
      if (group.items?.length > 0) {
        items.push({ type: 'header', label: group.label, icon: group.icon });
        group.items.forEach((item) =>
          items.push({
            type: 'entity',
            category: group.category,
            categoryLabel: group.label,
            categoryIcon: group.icon,
            ...item,
          }),
        );
      }
    });

    return items;
  }, [navResults, apiResults]);

  // Selectable items (excluding headers)
  const selectableItems = useMemo(
    () => allResults.filter((r) => r.type !== 'header'),
    [allResults],
  );

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [allResults.length]);

  // ── Recent searches ────────────────────────────
  const addRecentSearch = useCallback(
    (item) => {
      const updated = addRecent(storageKey, item);
      setRecentSearches(updated);
    },
    [storageKey],
  );

  const clearRecentSearches = useCallback(() => {
    const updated = clearRecent(storageKey);
    setRecentSearches(updated);
  }, [storageKey]);

  return {
    open,
    setOpen,
    query,
    setQuery,
    loading,
    activeIndex,
    setActiveIndex,
    allResults,
    selectableItems,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
  };
}
