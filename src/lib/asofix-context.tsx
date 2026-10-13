import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchAsofixKpiData, type AsofixKpiData } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface AsofixContextValue {
  data: AsofixKpiData | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AsofixContext = createContext<AsofixContextValue | null>(null);

export function AsofixProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [data, setData] = useState<AsofixKpiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    setLoaded(false);
  }, [session?.user.id]);

  const requestData = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchAsofixKpiData(session.access_token);
      setData(nextData);
      setLoaded(true);
    } catch {
      setError('No se pudieron consultar los datos de Asófix.');
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const load = useCallback(async () => {
    if (loaded || loading) return;
    await requestData();
  }, [loaded, loading, requestData]);

  const refresh = useCallback(async () => {
    await requestData();
  }, [requestData]);

  const value = useMemo(() => ({ data, loading, error, load, refresh }), [data, loading, error, load, refresh]);

  return <AsofixContext.Provider value={value}>{children}</AsofixContext.Provider>;
}

export function useAsofix() {
  const context = useContext(AsofixContext);
  if (!context) throw new Error('useAsofix debe usarse dentro de AsofixProvider');
  return context;
}
