import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LanguageToggle } from '../../components/LanguageToggle';
import { Logo } from '../../components/Logo';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Optional link row under the card (e.g. "Already have an account? Log in"). */
  footer?: ReactNode;
}

// Centered card shell shared by every auth screen (DESIGN.md surfaces + spacing).
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <header className="flex h-16 items-center justify-between px-unit-lg">
        <Link to="/">
          <Logo size={30} />
        </Link>
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-unit-md py-unit-lg">
        <div className="w-full max-w-md">
          <div className="mb-unit-lg text-center">
            <h1 className="text-headline-lg font-bold">{title}</h1>
            {subtitle && <p className="mt-unit-xs text-body-md text-on-surface-variant">{subtitle}</p>}
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg">
            {children}
          </div>
          {footer && <div className="mt-unit-md text-center text-label-md">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

// A dismissible inline error banner used by the auth forms.
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-unit-md rounded-lg border border-error/30 bg-error-container px-unit-md py-unit-sm text-label-md text-on-error-container"
    >
      {message}
    </div>
  );
}
