import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errorMessage } from './api.js';

/**
 * Fetches a GET endpoint and exposes data, meta, loading and error state.
 * `deps` controls refetching; `enabled` skips the request when false.
 */
export function useFetch(url, deps = [], { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled || !url) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(url);
      if (!mounted.current) return;
      setData(response.data.data);
      setMeta(response.data.meta || null);
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, meta, loading, error, reload: load, setData };
}

export default useFetch;
