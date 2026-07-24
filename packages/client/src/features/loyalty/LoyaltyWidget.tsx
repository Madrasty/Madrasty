import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoyaltySummary } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { loyaltyApi } from './loyalty.api';

// Dashboard widget: points balance, current tier, and progress to the next tier
// (doc 05 §4). Reads /loyalty/me; the tier name is resolved server-side for the
// UI language. Renders nothing on failure so a dashboard never breaks over it.
export function LoyaltyWidget() {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState<LoyaltySummary | null>(null);

  useEffect(() => {
    loyaltyApi.getSummary(i18n.language).then(setSummary).catch(() => setSummary(null));
  }, [i18n.language]);

  if (!summary) return null;

  // Progress within the current tier band toward the next one.
  const progress =
    summary.nextTier && summary.pointsToNextTier != null
      ? Math.round(
          ((summary.lifetimePoints - (summary.currentTier?.minPoints ?? 0)) /
            (summary.nextTier.minPoints - (summary.currentTier?.minPoints ?? 0))) *
            100,
        )
      : 100;

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg">
      <div className="mb-unit-md flex items-center justify-between">
        <h2 className="text-headline-md">{t('loyalty.title')}</h2>
        <Icon name="loyalty" className="text-primary" />
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-display-lg-mobile font-bold leading-none">{summary.balance}</div>
          <div className="text-label-md text-on-surface-variant">{t('loyalty.pointsBalance')}</div>
        </div>
        {summary.currentTier?.name && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-unit-md py-1 text-label-md text-on-primary-container">
            <Icon name="workspace_premium" className="text-[1rem]" />
            {summary.currentTier.name}
          </span>
        )}
      </div>

      {summary.nextTier?.name && summary.pointsToNextTier != null ? (
        <div className="mt-unit-md">
          <div className="mb-1 flex justify-between text-label-sm text-on-surface-variant">
            <span>{t('loyalty.toNextTier', { points: summary.pointsToNextTier })}</span>
            <span>{summary.nextTier.name}</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      ) : (
        <p className="mt-unit-md text-label-sm text-on-surface-variant">{t('loyalty.topTier')}</p>
      )}
    </section>
  );
}
