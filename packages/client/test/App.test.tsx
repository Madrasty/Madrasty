import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../src/lib/i18n';
import { App } from '../src/app/App';

describe('App shell (landing route)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    void i18n.changeLanguage('ar');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Arabic landing hero with dir=rtl on <html>', async () => {
    render(<App />);
    expect(await screen.findByText(/نُمكّن مستقبل التعليم/)).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('switches to English + dir=ltr via the language toggle, and persists the choice', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'English' }));

    expect(await screen.findByText(/Empowering Egypt/)).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('madrasty_locale')).toBe('en');
  });
});
