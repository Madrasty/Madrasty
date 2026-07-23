import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AuthLayout, FormError } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { authErrorMessage } from './authError';
import { roleHome } from '../../app/navigation';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login({ identifier: identifier.trim(), password });
      const next = searchParams.get('next');
      navigate(next ?? roleHome(user.role), { replace: true });
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <span className="text-on-surface-variant">
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            {t('auth.login.registerLink')}
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-unit-md" noValidate>
        <FormError message={error} />
        <Input
          label={t('auth.fields.identifier')}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
        />
        <Input
          label={t('auth.fields.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Button type="submit" size="large" disabled={submitting} className="mt-unit-sm w-full">
          {submitting ? t('auth.actions.submitting') : t('auth.login.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
