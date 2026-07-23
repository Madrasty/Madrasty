import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import type { NavItem } from '../app/navigation';

interface SidebarProps {
  items: NavItem[];
}

// DESIGN.md "Navigation": 280px fixed rail, active item gets a soft-blue wash
// and a 4px pill on the *leading* edge. `border-s-4` (border-inline-start) flips
// that edge to the right automatically in RTL — never use border-l/border-r.
export function Sidebar({ items }: SidebarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <aside className="fixed start-0 top-0 z-40 hidden h-screen w-[280px] flex-col border-e border-outline-variant bg-surface p-unit-lg md:flex">
      <div className="mb-unit-lg">
        <h1 className="text-headline-lg font-bold text-primary">{t('app.name')}</h1>
        <p className="text-label-md text-on-surface-variant">{t('app.tagline')}</p>
      </div>

      <nav className="flex flex-1 flex-col gap-unit-sm">
        {items.map((item) => {
          const active = item.path === pathname;
          const className = `flex items-center gap-unit-md rounded-lg border-s-4 px-unit-md py-unit-sm text-label-md transition-colors ${
            active
              ? 'border-primary bg-primary-container text-on-primary-container'
              : 'border-transparent text-on-surface-variant hover:bg-surface-container-high'
          }`;
          const content = (
            <>
              <Icon name={item.icon} filled={active} />
              {t(`nav.${item.labelKey}`)}
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
              className={`${className} cursor-default opacity-60`}
            >
              {content}
            </span>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-unit-sm border-t border-outline-variant pt-unit-md">
        <span className="flex cursor-default items-center gap-unit-md rounded-lg px-unit-md py-unit-sm text-label-md text-on-surface-variant opacity-60">
          <Icon name="settings" />
          {t('nav.settings')}
        </span>
      </div>
    </aside>
  );
}
