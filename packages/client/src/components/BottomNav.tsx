import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import type { NavItem } from '../app/navigation';

interface BottomNavProps {
  items: NavItem[];
}

// Mobile-only bottom-tab bar (DESIGN.md: sidebar collapses to this under md).
export function BottomNav({ items }: BottomNavProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 z-40 flex h-16 w-full items-center justify-around border-t border-outline-variant bg-surface md:hidden">
      {items.map((item) => {
        const active = item.path === pathname;
        const className = `flex w-16 flex-col items-center justify-center rounded-lg p-2 text-label-sm ${
          active ? 'font-bold text-primary' : 'text-on-surface-variant'
        }`;
        const content = (
          <>
            <Icon name={item.icon} filled={active} />
            <span className="mt-1">{t(`nav.${item.labelKey}`)}</span>
          </>
        );
        return item.path ? (
          <Link key={item.labelKey} to={item.path} className={className}>
            {content}
          </Link>
        ) : (
          <span key={item.labelKey} aria-disabled="true" className={`${className} opacity-60`}>
            {content}
          </span>
        );
      })}
    </nav>
  );
}
