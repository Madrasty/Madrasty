import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../src/lib/i18n';
import { LandingPage } from '../src/features/marketing/LandingPage';
import { ThemeToggle } from '../src/components/ThemeToggle';

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('landing page copy', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(cleanup);

  // The landing page builds most of its keys by template (`landing.role_${key}Can${n}`,
  // `landing.${key}Title`, …), which a static key sweep can't see. i18next echoes
  // a missing key back as its own name, so any raw `landing.`/`roles.` string in
  // the rendered output is a key that does not exist.
  it.each(['en', 'ar'])('renders no missing i18n keys in %s', async (locale) => {
    await i18n.changeLanguage(locale);
    const { container } = renderLanding();

    const leaked = (container.textContent ?? '').match(/\b(landing|roles)\.[A-Za-z0-9_]+/g);
    expect(leaked).toBeNull();
  });

  it('shows one card per role, each with its boundary rule', async () => {
    await i18n.changeLanguage('en');
    renderLanding();

    const roles = screen.getByRole('region', { name: /three people, one school year/i });
    for (const role of ['Parent', 'Student', 'Teacher']) {
      expect(within(roles).getByRole('heading', { name: role })).toBeInTheDocument();
    }
    expect(
      within(roles).getByText(/always resolves to a verified guardian/i),
    ).toBeInTheDocument();
    expect(within(roles).getByText(/only after admin review/i)).toBeInTheDocument();
  });
});

describe('theme toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    void i18n.changeLanguage('en');
  });

  afterEach(cleanup);

  // The whole dark theme is one class on <html> re-pointing the colour roles —
  // if the class lands and persists, every `bg-surface`/`text-on-surface` in the
  // app follows it, so there is nothing per-component to assert.
  it('toggles the .dark class on <html> and persists the choice', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /switch to dark theme/i }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('madrasty_theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('madrasty_theme')).toBe('light');
  });
});
