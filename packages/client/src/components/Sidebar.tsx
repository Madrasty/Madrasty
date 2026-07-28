import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { Logo } from './Logo';
import type { NavItem } from '../app/navigation';

interface SidebarProps {
  items: NavItem[];
}

// DESIGN.md "Navigation": 280px fixed rail. The active item is a filled pill
// rather than an outlined row — one clearly-marked destination, everything else
// quiet until hover. `ps-*`/`border-e` are logical properties, so the rail and
// its indentation flip to the right in RTL with no second stylesheet.
export function Sidebar({ items }: SidebarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <aside className="fixed start-0 top-0 z-40 hidden h-screen w-[280px] flex-col border-e border-outline-variant/60 bg-surface-container-low p-unit-md md:flex">
      <div className="mb-unit-lg px-unit-sm pt-unit-sm">
        <h1>
          <Logo size={40} withTagline />
        </h1>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = item.path === pathname;
          const className = `flex items-center gap-unit-md rounded-full px-unit-md py-2.5 text-label-md transition-colors ${
            active
              ? 'bg-primary-container text-on-primary-container font-semibold'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`;
          const content = (
            <>
              <Icon name={item.icon} filled={active} className="text-[1.25rem]" />
              <span className="truncate">{t(`nav.${item.labelKey}`)}</span>
            </>
          );

          // Items without a path are placeholders for screens not built yet —
          // shown for layout fidelity, rendered as non-interactive.
          return item.path ? (
            <Link key={item.labelKey} to={item.path} className={className}>
              {content}
            </Link>
          ) : (
            <span
              key={item.labelKey}
              aria-disabled="true"
              className={`${className} cursor-default opacity-50`}
            >
              {content}
            </span>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-outline-variant/60 pt-unit-sm">
        <span className="flex cursor-default items-center gap-unit-md rounded-full px-unit-md py-2.5 text-label-md text-on-surface-variant opacity-50">
          <Icon name="settings" className="text-[1.25rem]" />
          {t('nav.settings')}
        </span>
      </div>
    </aside>
  );
}
