import { useTranslation } from 'react-i18next';

// Madrasty logo, rebuilt as vector from FrontEnd Design/madrasty_school_logo.
// The original asset is a raster PNG, which blurs at small sizes and can't
// follow the dark theme — this is the same mark as geometry: a school/house with
// a blue roof, a blue arch doorway, and a green book panel.
//
// The brand colours live here rather than in the design tokens on purpose. The
// tokens are ported 1:1 from DESIGN.md (see styles/index.css) and must not be
// hand-tuned; a logo owns its own palette and stays put when the theme changes.
// The blue is the same value as --color-primary-container, so the mark sits
// naturally next to primary-coloured UI.
const BLUE = '#2563eb';
const BLUE_LIGHT = '#3b7cf1'; // lit face of the roof, as in the original
const GREEN = '#17a06b';

interface LogoProps {
  /** 'full' (default) pairs the mark with the wordmark; 'mark' is the icon alone. */
  variant?: 'full' | 'mark';
  /** Show the tagline under the wordmark — for splash/landing headers. */
  withTagline?: boolean;
  /** Mark height in px. The wordmark scales alongside it. */
  size?: number;
  className?: string;
}

// The mark on its own — square, no text, safe at favicon sizes.
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* Roof — split down the middle into a lit and a shaded face. Round joins
          soften the apex the way the original does. */}
      <path d="M32 5 L32 29 H5 Z" fill={BLUE_LIGHT} stroke={BLUE_LIGHT} strokeWidth={2} strokeLinejoin="round" />
      <path d="M32 5 L59 29 H32 Z" fill={BLUE} stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />

      {/* Left wing: a solid block with the doorway arch cut out of it. */}
      <path
        d="M5 55 V37 a4 4 0 0 1 4-4 H30 V59 H21 V48 a6 6 0 0 0-12 0 V59 H9 a4 4 0 0 1-4-4 Z"
        fill={BLUE}
      />

      {/* Right wing: the book — a green panel with an open-ended white cover. */}
      <rect x={34} y={33} width={25} height={26} rx={4} fill={GREEN} />
      <path
        d="M39 39 H54 a2.5 2.5 0 0 1 2.5 2.5 V50 a2.5 2.5 0 0 1 -2.5 2.5 H39"
        stroke="#ffffff"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// Mark + wordmark. The wordmark is live text, not an outline, so it renders as
// "Madrasty" in English and "مدرستي" in Arabic and flips side automatically in
// RTL (flex-direction: row follows the writing direction).
export function Logo({ variant = 'full', withTagline = false, size = 32, className }: LogoProps) {
  const { t } = useTranslation();
  const name = t('app.name');

  if (variant === 'mark') {
    return (
      <span className={className}>
        <LogoMark size={size} title={name} />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-unit-sm ${className ?? ''}`}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-black text-primary" style={{ fontSize: size * 0.62 }}>
          {name}
        </span>
        {withTagline && (
          <span className="mt-0.5 text-label-md text-on-surface-variant">{t('app.tagline')}</span>
        )}
      </span>
    </span>
  );
}
