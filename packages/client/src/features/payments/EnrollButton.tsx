import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useAuth } from '../auth/AuthProvider';
import { CheckoutPanel } from './CheckoutPanel';

// The primary purchase CTA on a program page. Guests are sent to log in; a
// student gets the full checkout panel (coupon + points + summary); parents/staff
// get an honest note. Access is granted server-side by the webhook — never in the
// client (doc 04 §3).
export function EnrollButton({ programId }: { programId: string }) {
  const { t } = useTranslation();
  const { user, status } = useAuth();

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

  return <CheckoutPanel programId={programId} />;
}

function Note({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-label-sm text-on-surface-variant">
      <Icon name="info" className="text-[1rem]" />
      {text}
    </span>
  );
}
