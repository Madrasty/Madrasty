import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { TransactionView } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { LanguageToggle } from '../../components/LanguageToggle';
import { paymentsApi, PENDING_TXN_KEY } from './payments.api';

type Phase = 'polling' | 'paid' | 'failed' | 'timeout' | 'error' | 'missing';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 20;

// Landing screen after checkout (both the gateway redirect and the no-redirect
// mock path arrive here). It POLLS the server for the webhook-confirmed status —
// the redirect itself proves nothing (doc 04 §3).
export function CheckoutReturnPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const txnId = params.get('txn') ?? sessionStorage.getItem(PENDING_TXN_KEY);
  const [txn, setTxn] = useState<TransactionView | null>(null);
  const [phase, setPhase] = useState<Phase>(txnId ? 'polling' : 'missing');

  useEffect(() => {
    if (!txnId) return;
    let active = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;

    const settle = (next: Phase) => {
      if (next === 'paid' || next === 'failed') sessionStorage.removeItem(PENDING_TXN_KEY);
      setPhase(next);
    };

    const poll = async () => {
      try {
        const current = await paymentsApi.getTransaction(txnId);
        if (!active) return;
        setTxn(current);
        if (current.status === 'paid') return settle('paid');
        if (current.status === 'failed') return settle('failed');
        if (++tries >= MAX_POLLS) return setPhase('timeout');
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (active) setPhase('error');
      }
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [txnId]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-outline-variant bg-surface px-unit-lg">
        <Link
          to="/"
          className="flex items-center gap-2 text-label-md text-on-surface-variant hover:text-primary"
        >
          <Icon name="arrow_back" className="rtl:-scale-x-100" />
          {t('app.name')}
        </Link>
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center p-unit-lg">
        <div className="flex w-full max-w-md flex-col items-center gap-unit-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-unit-xl text-center">
          <StatusIcon phase={phase} />
          <h1 className="text-headline-md font-semibold">{t(`checkout.return.${phase}Title`)}</h1>
          <p className="text-body-md text-on-surface-variant">
            {t(`checkout.return.${phase}Body`)}
          </p>
          <Actions phase={phase} programId={txn?.purchasableId ?? null} />
        </div>
      </main>
    </div>
  );
}

function StatusIcon({ phase }: { phase: Phase }) {
  if (phase === 'polling') {
    return <Icon name="progress_activity" className="animate-spin text-[3rem] text-primary" />;
  }
  const map: Record<Exclude<Phase, 'polling'>, { name: string; cls: string }> = {
    paid: { name: 'check_circle', cls: 'text-secondary' },
    failed: { name: 'cancel', cls: 'text-error' },
    timeout: { name: 'hourglass_top', cls: 'text-tertiary' },
    error: { name: 'error', cls: 'text-error' },
    missing: { name: 'help', cls: 'text-on-surface-variant' },
  };
  const { name, cls } = map[phase];
  return <Icon name={name} filled className={`text-[3rem] ${cls}`} />;
}

function Actions({ phase, programId }: { phase: Phase; programId: string | null }) {
  const { t } = useTranslation();
  const primary =
    'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-unit-lg text-label-md font-medium text-on-primary hover:opacity-90';
  const secondary =
    'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-outline-variant px-unit-lg text-label-md font-medium text-on-surface hover:bg-surface-container-low';

  if (phase === 'polling') return null;

  return (
    <div className="mt-unit-sm flex w-full flex-col gap-unit-sm">
      {phase === 'paid' && programId && (
        <Link to={`/app/catalog/${programId}`} className={primary}>
          {t('checkout.return.openProgram')}
          <Icon name="arrow_forward" className="text-[1.1rem] rtl:-scale-x-100" />
        </Link>
      )}
      {phase === 'paid' && (
        <Link to="/app/student" className={secondary}>
          {t('checkout.return.myLearning')}
        </Link>
      )}
      {(phase === 'failed' || phase === 'timeout' || phase === 'error') && programId && (
        <Link to={`/app/catalog/${programId}`} className={primary}>
          {t('checkout.return.tryAgain')}
        </Link>
      )}
      {(phase === 'failed' || phase === 'timeout' || phase === 'error' || phase === 'missing') && (
        <Link to="/app/catalog" className={secondary}>
          {t('checkout.return.backToCatalog')}
        </Link>
      )}
    </div>
  );
}
