# Arabic/English Support + UI/UX Guidelines

## 1. i18n Architecture

- **Frontend**: `react-i18next` with two namespaces minimum — `common` (buttons, nav, errors) and per-feature (`checkout`, `dashboard`, `loyalty`, etc.). Locale files under `client/src/locales/ar/*.json` and `client/src/locales/en/*.json`.
- **Backend**: an `i18n.middleware.ts` reads `Accept-Language` header or a `locale` query param / user's `locale_preference` (doc 03) and attaches `req.locale` — used when generating notifications, emails, and any server-rendered text (e.g., PDF certificates, invoices).
- **Database content**: curriculum/course/coupon text goes through the `translations` table (doc 03) — never hardcode Arabic or English directly into a `title` column.
- **Dates & numbers**: use `Intl.DateTimeFormat` / `Intl.NumberFormat` with the active locale — Arabic-Indic numerals vs Western numerals is a common Egypt-specific UX debate; default to Western numerals (٠١٢٣ vs 0123) since that's what most Egyptian users expect in digital products, but make it a locale-config toggle, not a hardcoded choice.

## 2. RTL/LTR Handling

- Use **CSS logical properties** (`margin-inline-start` instead of `margin-left`, etc.) or Tailwind's RTL-aware utilities so you don't maintain two stylesheets.
- Set `dir="rtl"` / `dir="ltr"` on the `<html>` tag dynamically based on active locale — not per-component.
- Icons that imply direction (arrows, "next/back" chevrons) must flip with `dir` — test every "next lesson" / "back" button in both languages, this is the #1 thing that looks broken in bilingual apps if missed.
- Mixed content lines (e.g., an Arabic sentence containing an English course name or a number) — rely on Unicode's bidi algorithm; avoid manually reversing strings.

## 3. Language switching UX
- Persist choice in `users.locale_preference` for logged-in users; `localStorage` fallback for guests.
- Switching language should not require a page reload if feasible (i18next supports live switching) — but if using SSR later, plan for a locale-prefixed route (`/ar/...`, `/en/...`) which also helps SEO.

## 4. General UI/UX Principles for This Platform

Given your four user types have very different needs and technical comfort levels:

| User | Design priority |
|---|---|
| Young students (primary) | Large tap targets, minimal text, gamified visuals (progress bars, badges), audio cues |
| Preparatory students | Clear subject/lesson navigation, quick access to "continue where I left off," visible quiz scores |
| Parents | Dashboard-first (not course-browsing-first) — the first screen after login should answer "how is my child doing," not sell more courses |
| Teachers | Data-dense but organized — earnings, upcoming sessions, and pending homework-to-grade should be visible without digging |
| Admin | Table/filter-heavy, bulk actions (approve 10 courses at once), exportable reports |

**Concrete guidelines:**
- **Consistency**: one design system (buttons, cards, spacing scale) shared across all four dashboards — build it once in `client/src/components/`, don't let each dashboard invent its own button style.
- **Loading & empty states**: every list (courses, homework, transactions) needs a designed empty state ("No homework yet — here's how to assign one") not a blank white screen.
- **Payment UX**: show the full price breakdown (price → coupon → points → total) before the user commits — surprise pricing kills trust fast in a market sensitive to price.
- **Mobile-first**: most Egyptian parents and students will use this on a phone browser, not desktop — design and test mobile layouts first, desktop second.
- **Performance on average connections**: compress video appropriately, lazy-load dashboards, avoid huge JS bundles — many users won't be on fast fiber connections.
- **Accessibility basics**: sufficient color contrast, readable Arabic font at small sizes (test with an actual Arabic webfont like `Cairo`, `Almarai`, or `IBM Plex Sans Arabic` — default system fonts render Arabic poorly on some platforms).

## 5. Content/Tone
- Arabic copy should use **Modern Standard Arabic with a light Egyptian-friendly tone** for marketing/help text (not heavy slang, but not stiff formal MSA either) — matches how Nagwa/Noon Academy communicate, and matches the tone you already use for Knouz's Egyptian-dialect copy where appropriate for that context (courses/education content skews more toward standard Arabic, marketing pushes can be more colloquial).
