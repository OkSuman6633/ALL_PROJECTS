'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { MenuIcon, PlusIcon, ChevronRight, LogOutIcon } from '@/components/icons';

interface TopNavProps {
  onOpenMobile: () => void;
}

export function TopNav({ onOpenMobile }: TopNavProps) {
  const pathname = usePathname();
  const { user, hasPermission, logout } = useAuth();
  const isSandbox = pathname.startsWith('/sandbox');
  const canCreate = hasPermission('assessments:write');

  // Generate breadcrumb items from pathname
  const segments = pathname.split('/').filter(Boolean);
  const homeBreadcrumb = { label: 'AI Operations', href: '/overview' };
  const breadcrumbs = [
    homeBreadcrumb,
    ...segments.map((seg, idx) => {
      const url = `/${segments.slice(0, idx + 1).join('/')}`;
      let label = seg.charAt(0).toUpperCase() + seg.slice(1);
      if (seg.length === 36 && seg.includes('-')) {
        label = `Assessment #${seg.slice(0, 8)}`;
      }
      return { label, href: url };
    }).filter((crumb) => crumb.href !== homeBreadcrumb.href),
  ];

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onOpenMobile}
          aria-label="Open navigation menu"
        >
          <MenuIcon size={20} />
        </button>

        <nav aria-label="Breadcrumb" className="breadcrumbs">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.href}>
                {idx > 0 && (
                  <ChevronRight size={12} style={{ color: 'var(--text-faint)' }} />
                )}
                {isLast ? (
                  <span className="breadcrumb-item active">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="breadcrumb-item">
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      <div className="topbar-right">
        {user?.role && (
          <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
            {user.role}
          </span>
        )}
        {isSandbox ? (
          <span className="env-badge env-badge-sandbox">
            Sandbox Environment
          </span>
        ) : (
          <span className="env-badge env-badge-production">
            Production
          </span>
        )}

        {canCreate && (
          <Link href="/assessments/new" className="btn btn-primary btn-sm">
            <PlusIcon size={14} />
            <span>New Assessment</span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => void logout()}
          className="btn btn-ghost btn-sm"
          title="Sign out"
        >
          <LogOutIcon size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}
