import type { HTMLAttributes } from 'react';

// DESIGN.md "Cards": white surface, 16px internal padding, 16px radius (Level 1).
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-outline-variant bg-surface-container-lowest p-unit-md ${className}`}
      {...props}
    />
  );
}
