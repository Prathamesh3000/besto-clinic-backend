/**
 * Tenant-wide doctor presence hook.
 *
 * - On first mount per tab, fetches the current presence snapshot once.
 * - Subscribes to `presence:change` socket events and merges into the map.
 * - Returns a stable `Map<userId, { status, role, name, lastChangedAt }>` plus
 *   a `statusFor(userId)` convenience function.
 */
import { useEffect, useState, useCallback } from 'react';
import { onPresenceChange } from '../socket';
import { getPresenceSnapshot } from '../../patient/api';

export function usePresence({ enabled = true } = {}) {
  const [map, setMap] = useState(() => new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return () => {};

    let cancelled = false;

    getPresenceSnapshot()
      .then((resp) => {
        if (cancelled) return;
        const seed = new Map();
        const list = resp?.data || resp || [];
        list.forEach((entry) => {
          if (entry?.userId) seed.set(String(entry.userId), entry);
        });
        setMap(seed);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    const off = onPresenceChange((payload) => {
      if (!payload?.userId) return;
      setMap((prev) => {
        const next = new Map(prev);
        next.set(String(payload.userId), {
          userId: String(payload.userId),
          status: payload.status,
          role: payload.role,
          name: payload.name,
          lastChangedAt: payload.lastChangedAt,
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [enabled]);

  const statusFor = useCallback(
    (userId) => {
      if (!userId) return 'offline';
      return map.get(String(userId))?.status || 'offline';
    },
    [map],
  );

  return { presenceMap: map, statusFor, loaded };
}
