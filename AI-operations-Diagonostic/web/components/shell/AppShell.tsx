'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { LogoIcon } from '@/components/icons';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

interface AppShellProps {
  children: React.ReactNode;
}

const AUTH_ROUTES = new Set(['/login', '/register', '/onboarding']);

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  const isAuthRoute = AUTH_ROUTES.has(pathname);

  if (isLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-card">
          <div className="brand-icon">
            <LogoIcon size={18} />
          </div>
          <span>Checking workspace session…</span>
        </div>
      </div>
    );
  }

  if (isAuthRoute) {
    return <>{children}</>;
  }

  if (!user || !user.onboarding_completed) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-card">
          <div className="brand-icon">
            <LogoIcon size={18} />
          </div>
          <span>Redirecting to sign in…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="app-main">
        <TopNav onOpenMobile={() => setMobileOpen(true)} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}

