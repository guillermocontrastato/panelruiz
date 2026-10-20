import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

import { isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_PROFILES } from '@/lib/mock-data';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInAsDemo: (role?: 'admin' | 'gerente' | 'operador') => void;
  signOut: () => Promise<void>;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => {
    try {
      const saved = localStorage.getItem('ruiz_demo_profile');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // If we already have a saved demo profile, mark loading done
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        setProfile((prev) => prev?.id.startsWith('demo-') ? prev : null);
        setLoading(false);
      }
    }).catch(() => {
      setProfile((prev) => prev?.id.startsWith('demo-') ? prev : null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'INITIAL_SESSION') return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setSession(sess);
        setLoading(false);
        return;
      }

      setSession(sess);
      setProfile(null);
      setLoading(Boolean(sess));
      if (!sess) {
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Safety: never stay stuck on loading
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!session || isPasswordRecovery) {
      if (!isPasswordRecovery && isSupabaseConfigured && !profile?.id.startsWith('demo-')) {
        setProfile(null);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!cancelled) {
          if (data) setProfile(data as Profile);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session, isPasswordRecovery]);

  const signIn = async (email: string, password: string) => {
    setProfile(null);
    setSession(null);
    setLoading(true);

    if (!isSupabaseConfigured) {
      // Offline / demo authentication
      const matched = DEMO_PROFILES.find((p) => p.email.toLowerCase() === email.toLowerCase()) || {
        id: `demo-${Date.now()}`,
        email,
        full_name: email.split('@')[0],
        role: 'admin' as const,
        active: true,
        created_at: new Date().toISOString(),
      };
      setProfile(matched);
      localStorage.setItem('ruiz_demo_profile', JSON.stringify(matched));
      setLoading(false);
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        return { error: error.message };
      }
      return { error: null };
    } catch (err) {
      setLoading(false);
      return { error: err instanceof Error ? err.message : 'Error al iniciar sesión' };
    }
  };

  const signInAsDemo = (role: 'admin' | 'gerente' | 'operador' = 'admin') => {
    const matched = DEMO_PROFILES.find((p) => p.role === role) || DEMO_PROFILES[0];
    setProfile(matched);
    localStorage.setItem('ruiz_demo_profile', JSON.stringify(matched));
    setLoading(false);
  };

  const signOut = async () => {
    localStorage.removeItem('ruiz_demo_profile');
    if (isSupabaseConfigured) {
      await supabase.auth.signOut().catch(() => {});
    }
    setSession(null);
    setProfile(null);
  };

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signInAsDemo, signOut, isPasswordRecovery, clearPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
