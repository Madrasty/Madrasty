import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';

// Shared loading / error / empty scaffolding for the admin review queues, so both
// screens present the three states identically.
export function ReviewState<T>({
  items,
  error,
  emptyIcon,
  emptyTitle,
  emptyHint,
  children,
}: {
  items: T[] | null;
  error: boolean;
  emptyIcon: string;
  emptyTitle: string;
  emptyHint: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  if (error) {
    return (
      <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-error/40 bg-error/5 p-unit-xl text-center">
        <Icon name="error" className="text-[2.5rem] text-error" />
        <p className="text-body-lg font-semibold">{t('admin.review.error')}</p>
      </div>
    );
  }
  if (items === null) {
    return (
      <div className="flex justify-center py-unit-xl text-on-surface-variant">
        <Icon name="progress_activity" className="animate-spin text-[2rem]" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-xl text-center">
        <Icon name={emptyIcon} className="text-[2.5rem] text-on-surface-variant" />
        <p className="text-body-lg font-semibold">{emptyTitle}</p>
        <p className="text-body-md text-on-surface-variant">{emptyHint}</p>
      </div>
    );
  }
  return <>{children}</>;
}
