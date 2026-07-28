import type { ElementType, ReactNode } from 'react';

/**
 * The small vocabulary every page is written in: an eyebrow label, a section
 * header, a page header, and a chip. Keeping them here is what makes the
 * dashboards and the marketing page read as one product rather than as a set of
 * screens that each invented their own heading rhythm.
 */

// All-caps eyebrow above a heading (DESIGN.md "Hierarchy Rules": label-sm in
// all-caps for headers and meta-tags).
export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-label-sm uppercase tracking-[0.12em] text-primary-container ${className}`}>
      {children}
    </p>
  );
}

/** Alternating section backgrounds keep a long page readable. */
type Tone = 'base' | 'alt';

export function Section({
  id,
  kicker,
  title,
  lead,
  tone = 'base',
  children,
}: {
  id?: string;
  kicker?: string;
  title: string;
  lead?: string;
  tone?: Tone;
  children: ReactNode;
}) {
  // Naming the section after its own heading is what makes it a landmark for
  // screen readers, instead of an anonymous <section> they skip over.
  const headingId = id ? `${id}-heading` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`scroll-mt-24 border-t border-outline-variant/50 py-unit-xl md:py-28 ${
        tone === 'alt' ? 'bg-surface-container-low' : 'bg-surface'
      }`}
    >
      <div className="content-container">
        <header className="max-w-3xl">
          {kicker ? <Kicker>{kicker}</Kicker> : null}
          <h2 id={headingId} className="mt-3 text-headline-md text-on-surface md:text-headline-lg">
            {title}
          </h2>
          {lead ? <p className="mt-4 text-body-lg text-on-surface-variant">{lead}</p> : null}
        </header>
        <div className="mt-10 md:mt-14">{children}</div>
      </div>
    </section>
  );
}

// Top-of-page heading inside the dashboard shell: title, optional lead, and a
// slot on the trailing edge for the page's own actions.
export function PageHeader({
  kicker,
  title,
  lead,
  actions,
  as: Tag = 'h1',
}: {
  kicker?: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
  as?: ElementType;
}) {
  return (
    <header className="mb-unit-lg flex flex-wrap items-end justify-between gap-unit-md">
      <div className="min-w-0">
        {kicker ? <Kicker>{kicker}</Kicker> : null}
        <Tag className="mt-1 text-headline-md text-on-surface md:text-headline-lg">{title}</Tag>
        {lead ? <p className="mt-2 text-body-md text-on-surface-variant">{lead}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-unit-sm">{actions}</div> : null}
    </header>
  );
}

type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'border-outline-variant bg-surface-container-lowest text-on-surface-variant',
  primary: 'border-transparent bg-primary-fixed text-on-primary-fixed',
  success: 'border-transparent bg-secondary-container text-on-secondary-container',
  warning: 'border-transparent bg-tertiary-fixed text-on-tertiary-fixed',
  danger: 'border-transparent bg-error-container text-on-error-container',
};

export function Chip({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label-md ${CHIP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
