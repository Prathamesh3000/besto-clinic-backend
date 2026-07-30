import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Reads `?highlight=<id>&hsearch=<name>` from the URL.
 * Returns both values so the page can pre-fill its search input
 * (to surface the record even if it's on another page) and
 * highlight the matching row once data loads.
 *
 * Handles both initial navigation AND same-page re-navigation
 * (e.g., user is on /clinic/patients and searches for a patient).
 *
 * Cleans up URL params immediately. Auto-clears highlightId
 * after the pulse animation finishes.
 *
 * @param {Object}  [options]
 * @param {number}  [options.duration=3200] — ms before clearing highlight state
 * @returns {{ highlightId: string|null, highlightSearch: string|null }}
 */
export function useHighlightFromUrl({ duration = 3200 } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Synchronous read for initial mount — no flash
  const [highlightId, setHighlightId] = useState(() => searchParams.get('highlight'));
  const [highlightSearch, setHighlightSearch] = useState(() => searchParams.get('hsearch'));

  // Watch searchParams for both initial mount and same-page re-navigation.
  // When setSearchParams cleans the URL, the effect re-fires but exits early
  // because highlight/hsearch are already gone — no infinite loop.
  useEffect(() => {
    const id = searchParams.get('highlight');
    const hs = searchParams.get('hsearch');
    if (!id && !hs) return;

    if (id) setHighlightId(id);
    if (hs) setHighlightSearch(hs);

    const next = new URLSearchParams(searchParams);
    next.delete('highlight');
    next.delete('hsearch');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Auto-clear highlight after animation completes
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), duration);
    return () => clearTimeout(timer);
  }, [highlightId, duration]);

  return { highlightId, highlightSearch };
}
