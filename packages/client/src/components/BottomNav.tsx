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
    <nav className="fixed bottom-0 z-40 flex h-16 w-full items-stretch justify-around border-t border-outline-variant/60 bg-surface/95 backdrop-blur-md md:hidden">
      {items.map((item) => {
        const active = item.path === pathname;
        const className = `flex w-16 flex-col items-center justify-center gap-0.5 pt-1 text-label-sm transition-colors ${
          active ? 'text-primary-container' : 'text-on-surface-variant'
        }`;
        // The active tab is marked by a filled icon in a soft brand pill — the
        // bottom bar has no room for the sidebar's full-width pill.
        const content = (
          <>
            <span
              className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                active ? 'bg-primary-fixed' : ''
              }`}
            >
              <Icon name={item.icon} filled={active} className="text-[1.25rem]" />
            </span>
            <span className="max-w-full truncate px-1">{t(`nav.${item.labelKey}`)}</span>
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
