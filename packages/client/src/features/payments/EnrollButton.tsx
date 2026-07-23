import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { ApiError } from '../../lib/api';
import { config } from '../../lib/config';
import { useAuth } from '../auth/AuthProvider';
import { paymentsApi, PENDING_TXN_KEY } from './payments.api';

// The primary purchase CTA on a program page. Owns the checkout initiation:
// start checkout → either hand off to the gateway's hosted page (redirectUrl) or
// go straight to the status screen (providers with no redirect, e.g. the dev
// mock). Access is granted server-side by the webhook — never here (doc 04 §3).
export function EnrollButton({ programId }: { programId: string }) {
  const { t } = useTranslation();
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guests: send them to log in first.
  if (status !== 'authenticated' || !user) {
    return (
      <Link to="/login">
        <Button variant="primary" size="large">
          <Icon name="login" className="text-[1.1rem] rtl:-scale-x-100" />
          {t('checkout.loginToEnroll')}
        </Button>
      </Link>
    );
  }

  // Buying for a child needs child selection, which isn't built yet; staff can't
  // purchase at all. Both render an honest note instead of a dead button.
  if (user.role === 'parent') return <Note text={t('checkout.parentSoon')} />;
  if (user.role !== 'student') return <Note text={t('checkout.staffCannotBuy')} />;

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const result = await paymentsApi.checkout({
        purchasableType: 'learning_program',
        purchasableId: programId,
        provider: config.paymentProvider,
      });
      if (result.redirectUrl) {
        // Hand off to the gateway's hosted page; remember the txn for the return.
        sessionStorage.setItem(PENDING_TXN_KEY, result.transactionId);
        window.location.assign(result.redirectUrl);
        return;
      }
      navigate(`/checkout/return?txn=${result.transactionId}`);
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiError ? err.code : 'unknown_error';
      // Fall back to a generic message for codes we don't translate explicitly.
      setError(t([`checkout.errors.${code}`, 'checkout.errors.unknown_error']));
    }
  }

  return (
    <div className="flex flex-col items-start gap-unit-sm lg:items-end">
      <Button variant="primary" size="large" onClick={enroll} disabled={busy}>
        <Icon
          name={busy ? 'progress_activity' : 'shopping_cart'}
          filled={!busy}
          className={busy ? 'animate-spin text-[1.1rem]' : 'text-[1.1rem]'}
        />
        {busy ? t('checkout.processing') : t('checkout.enrollNow')}
      </Button>
      {error && <span className="text-label-sm text-error">{error}</span>}
    </div>
  );
}

function Note({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-label-sm text-on-surface-variant">
      <Icon name="info" className="text-[1rem]" />
      {text}
    </span>
  );
}
