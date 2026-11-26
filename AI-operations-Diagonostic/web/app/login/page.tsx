'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { AlertTriangleIcon, EyeIcon, EyeOffIcon, LockIcon } from '@/components/icons';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter both your email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const signedInUser = await login(email.trim(), password);
      if (signedInUser.onboarding_completed) {
        router.replace('/start');
      } else {
        router.replace('/onboarding');
      }
    } catch (err) {
      setError((err as Error).message || 'Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      mode="login"
      title="Sign in to your workspace"
      subtitle="Enter your registered email and password to access the platform."
    >
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        {error && (
          <div className="auth-alert" role="alert">
            <AlertTriangleIcon size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="login-email" className="form-label">
            Email address
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="form-control"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="login-password" className="form-label">
            Password
          </label>
          <div className="auth-password-wrap">
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="form-control"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary btn-lg auth-submit-btn"
        >
          <LockIcon size={15} />
          <span>{isSubmitting ? 'Signing in…' : 'Sign In'}</span>
        </button>

        <p className="auth-switch-hint">
          New to AI Operations Diagnostic?{' '}
          <Link href="/register" className="auth-inline-link">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
