import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UseTableOptions {
  table: string;
  select?: string;
  filters?: Record<string, string | null>;
  search?: { columns: string[]; term: string };
  orderBy?: { column: string; ascending: boolean };
  page?: number;
  pageSize?: number;
  orgId?: string | null;
  eqs?: { column: string; value: string }[];
}

export function useTable<T = Record<string, unknown>>(opts: UseTableOptions) {
  const [data, setData] = useState<T[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase.from(opts.table).select(opts.select ?? '*', { count: 'exact' });

    if (opts.orgId) {
      query = query.eq('org_id', opts.orgId);
    }

    if (opts.eqs) {
      opts.eqs.forEach((e) => {
        query = query.eq(e.column, e.value);
      });
    }

    if (opts.filters) {
      Object.entries(opts.filters).forEach(([col, val]) => {
        if (val && val !== 'all') {
          query = query.eq(col, val);
        }
      });
    }

    if (opts.search?.term && opts.search.columns.length > 0) {
      const term = opts.search.term.trim();
      if (term) {
        const orCond = opts.search.columns.map((c) => `${c}.ilike.%${term}%`).join(',');
        query = query.or(orCond);
      }
    }

    if (opts.orderBy) {
      query = query.order(opts.orderBy.column, { ascending: opts.orderBy.ascending });
    }

    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 10;
    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data: rows, error: err, count: total } = await query;

    if (err) {
      setError(err.message);
      setData([]);
    } else {
      setData((rows ?? []) as T[]);
      setCount(total ?? 0);
    }
    setLoading(false);
  }, [
    opts.table, opts.select, opts.orgId, opts.page, opts.pageSize,
    JSON.stringify(opts.filters), JSON.stringify(opts.search),
    JSON.stringify(opts.orderBy), JSON.stringify(opts.eqs),
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, count, loading, error, refetch: fetchData };
}
