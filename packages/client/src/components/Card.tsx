import type { ElementType, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Render as something other than a div (`li` inside a list, `article`, …). */
  as?: ElementType;
  /** Adds a hover lift — only for cards that are themselves a link/button. */
  interactive?: boolean;
}

// DESIGN.md "Elevation & Depth", Level 1: a lifted surface with a 1px border.
// The border is held at 60% so it reads as a seam between tonal layers rather
// than a hard outline — that is what keeps a page of cards from looking like a
// wireframe, and it holds up in both themes.
export function Card({
  as: Tag = 'div',
  interactive = false,
  className = '',
  ...props
}: CardProps) {
  return (
    <Tag
      className={`rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-unit-lg ${
        interactive
          ? 'transition-all hover:-translate-y-0.5 hover:border-primary-container/60'
          : ''
      } ${className}`}
      {...props}
    />
  );
}
