import { useCallback, useEffect, useState } from 'react';

/** Brief initial “load” so skeleton UI can show (local / context data). */
export function useSimulatedInitialLoad(delayMs = 480) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), delayMs);
    return () => clearTimeout(t);
  }, []);
  return loading;
}

/** Pull-to-refresh for feeds backed by local state (simulated refetch). */
export function useSimulatedRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }, []);
  return { onRefresh, refreshing };
}
