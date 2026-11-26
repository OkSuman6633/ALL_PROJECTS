'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, getStoredToken, setStoredToken } from '@/lib/api';
import type { AuthUser, OnboardingPayload } from '@/types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  register: (email: string, password: string, confirmPassword: string) => Promise<AuthUser>;
  completeOnboarding: (payload: OnboardingPayload) => Promise<AuthUser>;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_AUTH_ROUTES = new Set(['/login', '/register']);
const ONBOARDING_ROUTE = '/onboarding';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const clearSession = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.getMe();
      setUser(res.user);
    } catch {
      clearSession();
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearSession();
      router.replace('/login');
    };
    window.addEventListener('aod:unauthorized', onUnauthorized);
    return () => window.removeEventListener('aod:unauthorized', onUnauthorized);
  }, [clearSession, router]);

  useEffect(() => {
    if (isLoading) return;

    const isPublicRoute = PUBLIC_AUTH_ROUTES.has(pathname);
    const isOnboardingRoute = pathname === ONBOARDING_ROUTE;

    if (!user) {
      if (!isPublicRoute) {
        router.replace('/login');
      }
      return;
    }

    if (!user.onboarding_completed) {
      if (!isOnboardingRoute) {
        router.replace('/onboarding');
      }
      return;
    }

    if (isPublicRoute || isOnboardingRoute) {
      router.replace('/start');
    }
  }, [isLoading, user, pathname, router]);

  const register = useCallback(
    async (email: string, password: string, confirmPassword: string): Promise<AuthUser> => {
      const res = await api.register({
        email,
        password,
        confirm_password: confirmPassword,
      });
      setStoredToken(res.access_token);
      setUser(res.user);
      return res.user;
    },
    []
  );

  const completeOnboarding = useCallback(async (payload: OnboardingPayload): Promise<AuthUser> => {
    const res = await api.completeOnboarding(payload);
    setUser(res.user);
    try {
      const existing = window.localStorage.getItem('ai_ops_workspace_preferences');
      const parsed = existing ? JSON.parse(existing) : {};
      window.localStorage.setItem(
        'ai_ops_workspace_preferences',
        JSON.stringify({
          defaultPeriod: 'Last 30 days',
          defaultUnit: 'cases',
          enableAutoAudit: true,
          strictCurrencyEnforcement: true,
          ...parsed,
          defaultCurrency: payload.default_currency || parsed.defaultCurrency || 'GBP',
          defaultSector: payload.sector || parsed.defaultSector || 'Professional services',
        })
      );
    } catch {
      // Ignore preference storage errors
    }
    return res.user;
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await api.login({ email, password });
    setStoredToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) {
        await api.logout();
      }
    } catch {
      // Ignore logout network failures and still clear local session
    } finally {
      clearSession();
      router.replace('/login');
    }
  }, [clearSession, router]);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      return (user.permissions || []).includes(permission);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user && user.onboarding_completed),
        hasPermission,
        register,
        completeOnboarding,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
