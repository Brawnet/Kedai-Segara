# Segara — Design System (MASTER)

Source: ui-ux-pro-max `--design-system "inventory stock management internal tool tablet"`
(dials: variance 3, motion 3, density 7), plus focused searches for typography
(`"dashboard tabular numbers legible sans"`), UX (touch targets, input types/labels)
and stack (`html-tailwind`). Edited 2026-09-28 to remove results that don't fit
(serif fonts, landing-page pattern, GSAP scroll reveal) and to fix contrast.

Product: internal stock app for one shop (Kedai Segara). Two surfaces:
- **Tablet/Staff**: kitchen tablet or phone, big touch targets, few words per screen.
- **Admin**: owner on phone or desktop, dense tables.

Pages may override this file in `pages/<page>.md`.

## Style

Minimalism / Swiss. Clean, functional, high contrast, grid-based, flat surfaces
with 1px borders. Light mode only (dark mode by default is listed as an anti-pattern).

## Color tokens

All pairs checked for WCAG AA (4.5:1 for normal text).

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--color-primary` | `#1D4ED8` | Primary buttons, active nav, links | white on it 6.7:1 |
| `--color-primary-soft` | `#EFF6FF` | Selected/active background | — |
| `--color-foreground` | `#0F172A` | Body text | 17:1 on bg |
| `--color-muted-foreground` | `#475569` | Secondary text | 7.2:1 on white |
| `--color-background` | `#F8FAFC` | Page | — |
| `--color-card` | `#FFFFFF` | Cards, sheets | — |
| `--color-muted` | `#F1F5F9` | Chips, table headers | — |
| `--color-border` | `#E2E8F0` | Dividers, card borders | — |
| `--color-border-strong` | `#64748B` | Input borders (≥3:1 non-text) | 4.8:1 on white |
| `--color-success` | `#047857` | Stock-in, "saved" | white on it 5.5:1 |
| `--color-warning` | `#B45309` | Low stock, rekap reminder | white on it 5.0:1 |
| `--color-warning-soft` | `#FFFBEB` | Warning banner background | warning text on it 4.8:1 |
| `--color-destructive` | `#B91C1C` | Cancel/undo, errors | white on it 6.5:1 |
| `--color-destructive-soft` | `#FEF2F2` | Error banner background | — |
| `--color-ring` | `#1D4ED8` | Focus ring (2px, 2px offset) | — |

Deviation from the generated palette: primary is blue (Segara = sea) instead of slate,
and the stock green was darkened from `#059669` to `#047857`, because white text on
`#059669` is only 3.8:1.

Never use color as the only signal: low stock also shows a "Menipis" label, and
errors show text.

## Typography

- Font: **Plus Jakarta Sans** (single family). Weights 400 / 600 / 700 / 800.
- Numbers: `font-variant-numeric: tabular-nums` in tables and quantity displays.
- Scale: title 24–30px/800, section 18–20px/700, body 16px/400 (never smaller than
  16px in inputs, to stop iOS zooming in), caption 13–14px/500.
- Line height: body 1.5, headings 1.2.
- Fallback: `system-ui, sans-serif`.

## Spacing, shape, elevation

- 4/8 rhythm: 4, 8, 12, 16, 24, 32, 48.
- Radius: inputs/buttons 10px, cards 14px, sheets/dialogs 20px (top corners on mobile).
- Shadows: only `shadow-sm` on cards; `shadow-lg` for sheets, dialogs and toasts.

## Touch & interaction

- Minimum target 44×44px everywhere; staff tiles are 64px+ tall. At least 8px gap.
- Press feedback: background/border color change within 150ms. No scale transforms
  that move the layout.
- Transitions 150–200ms `ease-out`; exits faster than enters. Everything off under
  `prefers-reduced-motion`.
- `cursor-pointer` on all clickables, visible `focus-visible` ring.
- Disabled = native `disabled`, 50% opacity, no action.
- Busy: the triggering button shows a spinner and is disabled.

## Forms

- Visible label above every input (placeholder is never the only label).
- Quantities: `inputmode="decimal"`; PIN: `inputmode="numeric"`, `type="password"`.
- Errors inline under the field, plus a toast for server errors.
- Numbers formatted `id-ID` (comma decimal).

## Layout by breakpoint

- **< 768px (phone)**: single column, sticky top bar, admin nav as a bottom tab bar
  plus "Lainnya" sheet; tables become stacked cards; dialogs are bottom sheets.
- **768–1023px (tablet)**: 2–3 column tile grids; tables allowed.
- **≥ 1024px (desktop)**: admin sidebar (240px) + content up to 1200px wide.

## Icons

Phosphor (`@phosphor-icons/react`), regular weight, 20px inline / 28px on tiles.
Decorative icons next to text get `aria-hidden`; icon-only buttons get `aria-label`.
No emoji as icons.

## Anti-patterns

- Excessive decoration, complex shadows, 3D effects
- Dark mode by default, heavy animation
- Layout-shifting hovers, instant state changes, invisible focus
- Horizontal scroll on phones, content hidden behind fixed bars

## Pre-delivery checklist

- [ ] No emoji icons; one icon set
- [ ] Text contrast ≥ 4.5:1; input borders ≥ 3:1
- [ ] Focus visible; reduced motion respected
- [ ] Targets ≥ 44px, gaps ≥ 8px
- [ ] Checked at 375, 768, 1024, 1440px; no horizontal scroll
- [ ] Staff mode never shows warehouse stock (`stok_dalam`)
