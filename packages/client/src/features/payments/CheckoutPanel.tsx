import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { CheckoutQuoteResult, LoyaltySummary } from '@madrasty/shared';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Input } from '../../components/Input';
import { ApiError } from '../../lib/api';
import { config } from '../../lib/config';
import { loyaltyApi } from '../loyalty/loyalty.api';
import { paymentsApi, PENDING_TXN_KEY } from './payments.api';

// The student purchase flow with loyalty (doc 05 §4): a coupon field, a "use my
// points" toggle, and a transparent order summary (original → coupon → points →
// final). Every number comes from the server's quote — the client never computes
// a discount or a total. Enroll forwards only the coupon code + points to spend.
export function CheckoutPanel({ programId }: { programId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<LoyaltySummary | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUsePoints = Boolean(summary && summary.balance >= summary.minRedeemPoints);
  const redeemPoints = usePoints && summary ? summary.balance : undefined;

  useEffect(() => {
    loyaltyApi.getSummary(i18n.language).then(setSummary).catch(() => setSummary(null));
  }, [i18n.language]);

  // Re-price whenever the applied coupon or the points toggle changes.
  const refreshQuote = useCallback(async () => {
    setQuoting(true);
    try {
      const result = await loyaltyApi.quote({
        purchasableType: 'learning_program',
        purchasableId: programId,
        couponCode: appliedCoupon ?? undefined,
        redeemPoints,
      });
      setQuote(result);
    } catch {
      setQuote(null);
    } finally {
      setQuoting(false);
    }
  }, [programId, appliedCoupon, redeemPoints]);

  useEffect(() => {
    void refreshQuote();
  }, [refreshQuote]);

  function applyCoupon() {
    const code = couponInput.trim();
    setAppliedCoupon(code ? code : null);
  }
  function removeCoupon() {
    setCouponInput('');
    setAppliedCoupon(null);
  }

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const result = await paymentsApi.checkout({
        purchasableType: 'learning_program',
        purchasableId: programId,
        provider: config.paymentProvider,
        couponCode: appliedCoupon ?? undefined,
        redeemPoints,
      });
      if (result.redirectUrl) {
        sessionStorage.setItem(PENDING_TXN_KEY, result.transactionId);
        window.location.assign(result.redirectUrl);
        return;
      }
      navigate(`/checkout/return?txn=${result.transactionId}`);
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiError ? err.code : 'unknown_error';
      setError(t([`checkout.errors.${code}`, 'checkout.errors.unknown_error']));
    }
  }

  const money = (v: string) => `${t('loyalty.egp')} ${v}`;
  const couponErrorText = quote?.couponError
    ? t([`checkout.couponErrors.${quote.couponError}`, 'checkout.couponErrors.default'])
    : null;

  return (
    <div className="flex w-full flex-col gap-unit-md rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg lg:w-80">
      {/* Coupon */}
      <div className="flex flex-col gap-unit-xs">
        {appliedCoupon && quote?.couponValid ? (
          <div className="flex items-center justify-between rounded-lg bg-secondary-container/40 px-unit-md py-unit-sm">
            <span className="inline-flex items-center gap-1 text-label-md text-on-surface">
              <Icon name="sell" className="text-[1rem] text-secondary" />
              {appliedCoupon}
            </span>
            <button onClick={removeCoupon} className="text-label-sm text-primary" type="button">
              {t('checkout.removeCoupon')}
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-unit-sm">
            <Input
              label={t('checkout.couponLabel')}
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder={t('checkout.couponPlaceholder')}
              className="flex-1"
            />
            <Button variant="secondary" onClick={applyCoupon} disabled={!couponInput.trim()}>
              {t('checkout.applyCoupon')}
            </Button>
          </div>
        )}
        {appliedCoupon && couponErrorText && (
          <span className="text-label-sm text-error">{couponErrorText}</span>
        )}
      </div>

      {/* Use points */}
      {summary && summary.balance > 0 && (
        <label
          className={`flex items-center justify-between gap-unit-sm rounded-lg px-unit-md py-unit-sm ${
            canUsePoints ? 'cursor-pointer bg-surface-container-low' : 'opacity-60'
          }`}
        >
          <span className="flex flex-col text-start">
            <span className="text-label-md text-on-surface">{t('checkout.usePoints')}</span>
            <span className="text-label-sm text-on-surface-variant">
              {t('checkout.pointsAvailable', { points: summary.balance })}
              {!canUsePoints &&
                ` · ${t('checkout.pointsMin', { min: summary.minRedeemPoints })}`}
            </span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={usePoints}
            disabled={!canUsePoints}
            onChange={(e) => setUsePoints(e.target.checked)}
          />
        </label>
      )}

      {/* Order summary */}
      {quote && (
        <div className="flex flex-col gap-unit-xs border-t border-outline-variant pt-unit-md text-label-md">
          <Row label={t('checkout.summary.original')} value={money(quote.originalEgp)} />
          {Number(quote.couponDiscountEgp) > 0 && (
            <Row
              label={t('checkout.summary.coupon')}
              value={`− ${money(quote.couponDiscountEgp)}`}
              accent
            />
          )}
          {Number(quote.pointsDiscountEgp) > 0 && (
            <Row
              label={t('checkout.summary.points', { points: quote.pointsRedeemed })}
              value={`− ${money(quote.pointsDiscountEgp)}`}
              accent
            />
          )}
          <Row
            label={t('checkout.summary.total')}
            value={money(quote.finalEgp)}
            className="mt-unit-xs border-t border-outline-variant pt-unit-sm text-body-lg font-bold"
          />
          {(quote.pointsToEarn > 0 || quote.couponBonusPoints > 0) && (
            <p className="mt-unit-xs inline-flex items-center gap-1 text-label-sm text-secondary">
              <Icon name="stars" className="text-[1rem]" />
              {t('checkout.summary.earn', {
                points: quote.pointsToEarn + quote.couponBonusPoints,
              })}
            </p>
          )}
        </div>
      )}

      <Button variant="primary" size="large" onClick={enroll} disabled={busy || quoting}>
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

function Row({
  label,
  value,
  accent,
  className = '',
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span className="text-on-surface-variant">{label}</span>
      <span className={accent ? 'text-secondary' : 'text-on-surface'}>{value}</span>
    </div>
  );
}
