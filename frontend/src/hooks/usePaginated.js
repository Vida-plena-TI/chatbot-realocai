import { useCallback, useEffect, useRef, useState } from 'react';

// Lista paginada no formato DRF: { count, next, previous, results }.
// Recarrega do zero sempre que `fetchPage` muda (ex.: troca de aba).
export function usePaginated(fetchPage) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const token = useRef(0);

  const load = useCallback(
    async (p, replace) => {
      const t = ++token.current;
      setLoading(true);
      setError(null);
      if (replace) setItems([]);
      try {
        const data = await fetchPage(p);
        if (t !== token.current) return;
        setItems((prev) => (replace ? data.results : [...prev, ...data.results]));
        setPage(p);
        setCount(data.count);
        setHasMore(Boolean(data.next));
      } catch (e) {
        if (t === token.current) setError(e);
      } finally {
        if (t === token.current) setLoading(false);
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    load(1, true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) load(page + 1, false);
  }, [loading, hasMore, page, load]);

  const reload = useCallback(() => load(1, true), [load]);

  return { items, setItems, count, hasMore, loading, error, loadMore, reload };
}
