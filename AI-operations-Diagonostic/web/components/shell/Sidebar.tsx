'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import {
  LogoIcon,
  OverviewIcon,
  AssessmentsIcon,
  RecommendationsIcon,
  ReportsIcon,
  SandboxIcon,
  HistoryIcon,
  SettingsIcon,
  ChevronRight,
  PlusIcon,
  LogOutIcon,
} from '@/components/icons';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const getInitials = (value: string, fallback: string) => {
    const cleaned = value.trim();
    if (!cleaned) return fallback;
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase();
  };

  const workspaceName = user?.workspace_name || 'Workspace';
  const workspaceInitials = getInitials(workspaceName, 'WS');
  const displayName = user?.full_name || user?.email || 'User';
  const userInitials = getInitials(displayName, 'U');
  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Member';
  const userSubtitle = user?.job_title ? `${user.job_title} · ${roleLabel}` : roleLabel;

  const isCurrent = (path: string) => {
    if (path === '/start') {
      return pathname === '/start' || pathname === '/';
    }
    return pathname.startsWith(path);
  };

  const navGroups: NavGroup[] = [
    {
      title: 'ENQUIRIES',
      items: [
        { label: 'New enquiry', href: '/start', icon: PlusIcon },
        { label: 'My enquiries', href: '/enquiries', icon: AssessmentsIcon },
        { label: 'Reports', href: '/reports', icon: ReportsIcon },
      ],
    },
    {
      title: 'ADVANCED',
      items: [
        { label: 'Overview', href: '/overview', icon: OverviewIcon },
        { label: 'Assessments', href: '/assessments', icon: AssessmentsIcon },
        { label: 'Recommendations', href: '/recommendations', icon: RecommendationsIcon },
        {
          label: 'Sandbox',
          href: '/sandbox',
          icon: SandboxIcon,
          badge: 'TEST',
        },
        { label: 'History', href: '/history', icon: HistoryIcon },
        { label: 'Settings', href: '/settings', icon: SettingsIcon },
      ],
    },
  ];

  return (
    <>
      {mobileOpen && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 35 }}
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''
          }`}
      >
        {/* Brand Header */}
        <div className="sidebar-header">
          <Link href="/start" className="brand-link" onClick={onCloseMobile}>
            <div className="brand-icon">
              <LogoIcon size={18} />
            </div>
            {!collapsed && (
              <div className="brand-text">
                <span className="brand-title">AI Operations</span>
                <span className="brand-badge">Diagnostic v0.1</span>
              </div>
            )}
          </Link>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronRight
              size={14}
              style={{
                transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 200ms',
              }}
            />
          </button>
        </div>

        {/* Current Workspace Card */}
        {!collapsed && (
          <div className="sidebar-workspace">
            <div className="workspace-card">
              <div className="workspace-avatar">{workspaceInitials}</div>
              <div className="workspace-info">
                <span className="workspace-name">{workspaceName}</span>
                <span className="workspace-status">Production Workspace</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Sections */}
        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div key={group.title} className="nav-group">
              {!collapsed && (
                <div className="nav-group-title">{group.title}</div>
              )}
              <ul className="nav-items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isCurrent(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`nav-link ${active ? 'active' : ''}`}
                        onClick={onCloseMobile}
                        title={collapsed ? item.label : undefined}
                      >
                        <span className="nav-icon">
                          <Icon size={16} />
                        </span>
                        {!collapsed && (
                          <span className="nav-label">{item.label}</span>
                        )}
                        {!collapsed && item.badge && (
                          <span className="nav-badge">{item.badge}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User Profile Footer */}
        <div className="sidebar-footer">
          <div className="user-avatar">{userInitials}</div>
          {!collapsed && (
            <div className="user-info">
              <span className="user-name">{displayName}</span>
              <span className="user-role">{userSubtitle}</span>
            </div>
          )}
          <button
            type="button"
            className="sidebar-signout-btn"
            onClick={() => void logout()}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOutIcon size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}

