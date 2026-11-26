import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth/AuthContext';
import { AppShell } from '@/components/shell/AppShell';

export const metadata: Metadata = {
  title: 'AI Operations Diagnostic',
  description: 'Evidence-led Operational Intelligence and Process Improvement Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
