'use client';

import { CONFIG } from '@/lib/config';

export function Header() {
  return (
    <header className="topbar">
      <div className="brandmark" aria-hidden="true">
        AO
      </div>
      <div>
        <div className="eyebrow">OPERATIONS INTELLIGENCE</div>
        <h1>AI Operations Diagnostic</h1>
      </div>
      <div className="topright">
        <span className="dot" aria-hidden="true" />
        <span>Local demo</span>
        <span className="pill">{CONFIG.APP_VERSION}</span>
      </div>
    </header>
  );
}
