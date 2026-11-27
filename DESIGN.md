---
name: Manhwa
library: "@heroui/react"
styles: "@heroui/styles"
modes:
  - light
  - dark
mode: operate
theme: "Uber preset, HeroUI Theme Builder (https://heroui.com/themes)"
source: "src/app/globals.css"
---

# Design System: Manhwa

The visual contract for the Manhwa platform: a working tool for finding, reading and tracking Series. The theme is the «Uber» preset from HeroUI's Theme Builder: monochrome, with neutral grays and small radii, and Geist as the application typeface. The covers carry the color; the interface does not compete with them. `src/app/globals.css` is the source of truth.

## Surface Mode: Operate

The visitor comes to get a job done: find a Serie, read a Capítulo, manage a Biblioteca. The page is first a working product of its category; the world serves it. Expression lives in type, palette, density and one signature move — never in replacing navigation, layout or standard controls. On every screen, the task, states and familiar affordances come first.

## Setup

Install `@heroui/react` and import HeroUI after Tailwind CSS:

```css
@import "tailwindcss";
@import "@heroui/styles";
```

Apply the semantic canvas colors at the application root:

```tsx
<body className="bg-background text-foreground">{children}</body>
```

Use `class="light"` or `data-theme="light"` for light mode and `class="dark"` or `data-theme="dark"` for dark mode. The `default` theme is the light theme.

### Application wiring

- `next-themes` writes the `light`/`dark` class on `<html>`, follows the system preference by default and keeps the choice in the browser. The header exposes a single theme toggle.
- `Geist` is loaded with `next/font` and exposed as `--font-sans`; HeroUI components inherit it. Do not add a second type system.
- The app shell is a top bar (`SiteHeader`) over a `max-w-6xl` content column, with a skip link before it. Every screen names its way up: the root (Catálogo) shows the wordmark and the theme toggle; a screen below it shows «‹ Parent» in place of the wordmark (the Serie shows «‹ Catálogo»). The reader keeps its own bar: the whole «‹ Serie title · Capítulo N · page/total» block is one link back to the Serie, then Inicio (house icon) and the theme toggle. Primary navigation appears only when a second real destination exists; never render a nav whose only item points at the current page. On mobile the bar stays one row; no drawer or second navigation model until a screen needs it.
- Use semantic Tailwind utilities (`bg-background`, `bg-surface`, `text-muted`, `border-separator`) and HeroUI components. Raw neutral palette classes and hardcoded colors are out.
- Text in the product is Spanish; headings are sentence case and use the working name «Manhwa».

## Design Direction

- Build calm, modern interfaces with a clear content hierarchy.
- Prefer whitespace, typography, and surface levels over decoration.
- The accent is achromatic: black in light mode, near-white in dark mode. Primary actions, focus and selection use it. Do not add a decorative hue; status colors are the only hues in the interface, and they carry meaning.
- Compose interfaces from HeroUI components before creating custom primitives.
- Keep interactions accessible, keyboard friendly, and visibly focused.
- Let semantic tokens adapt the interface between light and dark modes.

## Colors

Use semantic HeroUI tokens and Tailwind utilities in product code. Raw values are included for design handoff and visual QA only. Do not branch component code by color mode.

| Role | Tailwind utilities | CSS variables | Light | Dark | Purpose |
| --- | --- | --- | --- | --- | --- |
| Canvas | `bg-background text-foreground` | `--background`, `--foreground` | `oklch(97.02% 0 0)`, `oklch(21.03% 0 0)` | `oklch(12% 0 0)`, `oklch(99.11% 0 0)` | Page background and primary content |
| Surface | `bg-surface text-surface-foreground` | `--surface`, `--surface-foreground` | white, foreground | `oklch(21.03% 0 0)`, foreground | Cards and non-floating containers |
| Secondary surface | `bg-surface-secondary` | `--surface-secondary` | `oklch(95.24% 0 0)` | `oklch(25.7% 0 0)` | Nested or lower-emphasis regions |
| Tertiary surface | `bg-surface-tertiary` | `--surface-tertiary` | `oklch(93.73% 0 0)` | `oklch(27.21% 0 0)` | Stronger surface separation |
| Overlay | `bg-overlay text-overlay-foreground` | `--overlay`, `--overlay-foreground` | white, foreground | `oklch(21.03% 0 0)`, foreground | Popovers, menus, dialogs, and tooltips |
| Backdrop | `bg-backdrop` | `--backdrop` | black at 50% | black at 60% | Content dimming behind overlays |
| Muted content | `text-muted` | `--muted` | `oklch(52.4% 0 0)` | `oklch(70.5% 0 0)` | Supporting text and secondary icons |
| Neutral action | `bg-default text-default-foreground` | `--default`, `--default-foreground` | `oklch(94% 0 0)`, foreground | `oklch(27.4% 0 0)`, `oklch(99.11% 0 0)` | Neutral controls and selected states |
| Accent | `bg-accent text-accent-foreground` | `--accent`, `--accent-foreground` | `oklch(0 0 0)`, `oklch(99.11% 0 0)` | `oklch(0.9848 0 0)`, `oklch(15% 0 0)` | Primary actions, focus, and selection |
| Success | `bg-success text-success-foreground` | `--success`, `--success-foreground` | `oklch(0.53 0.1355 153.06)`, near-white | `oklch(0.6514 0.1321 156.22)`, near-black | Positive outcomes and completed states |
| Warning | `bg-warning text-warning-foreground` | `--warning`, `--warning-foreground` | `oklch(0.8446 0.1525 80.6)`, near-black | `oklch(0.8803 0.1348 86.06)`, near-black | Caution and attention |
| Danger | `bg-danger text-danger-foreground` | `--danger`, `--danger-foreground` | `oklch(0.573 0.2249 21.97)`, near-white | `oklch(0.7044 0.1872 23.19)`, near-black | Errors and destructive actions |
| Field | `bg-field text-field-foreground` | `--field-background`, `--field-foreground` | white, foreground | `oklch(21.03% 0 0)`, foreground | Inputs and interactive fields |
| Border | `border-border` | `--border` | `oklch(90% 0 0)` | `oklch(28% 0 0)` | Component boundaries |
| Separator | `border-separator` | `--separator` | `oklch(92% 0 0)` | `oklch(25% 0 0)` | Quiet structural dividers |

Hover, focus, soft, inverse, and secondary or tertiary border colors are derived with `color-mix()`. Use utilities such as `bg-accent-hover`, `bg-accent-soft`, `text-accent-soft-foreground`, `border-border-secondary`, and `border-separator-secondary` instead of recreating those formulas.

**Accessibility overrides (WCAG 2.2 AA, required by PRODUCT.md):** the Uber export leaves light `--muted` at `oklch(55.17% 0 0)` (4.42:1 on the canvas) and light `--success` at `oklch(0.6277 0.1604 153.06)` (3.12:1 with its foreground). `globals.css` sets `--muted: oklch(52.4% 0 0)` (≥4.5:1 on every light surface, down to `surface-tertiary`) and `--success: oklch(0.53 0.1355 153.06)` (4.7:1). Every other exported pair already passes. Any change to these tokens is re-measured against AA before it ships.

## Typography

HeroUI inherits the application's font family and uses Tailwind's type scale. Preserve the component defaults unless the product has its own type system.

- Use concise, descriptive headings in sentence case.
- Use `text-foreground` for primary content and `text-muted` for supporting content.
- Keep body copy readable with a comfortable line height and constrained line length.
- Use tabular numbers for changing metrics, prices, counters, and aligned numeric data.
- Avoid all-caps labels except for short, established conventions.

## Layout

The spacing base is `--spacing: 0.25rem`, giving the system a 4px rhythm through Tailwind spacing utilities.

- Use consistent Tailwind gaps and padding rather than one-off values.
- Keep related controls and content visually grouped.
- Constrain wide reading layouts and size containers to their content.
- Avoid doubling parent and child padding in the same direction.
- Align sibling cards, controls, labels, and metrics to shared visual anchors.

## Shapes

The base radius is `--radius: 0.25rem` (4px). The field radius is `--field-radius: 0.25rem` (4px), the same as the base: fields and buttons share one corner.

| Utility | Formula | Value |
| --- | --- | --- |
| `rounded-xs` | `calc(var(--radius) * 0.25)` | 1px |
| `rounded-sm` | `calc(var(--radius) * 0.5)` | 2px |
| `rounded-md` | `calc(var(--radius) * 0.75)` | 3px |
| `rounded-lg` | `calc(var(--radius) * 1)` | 4px |
| `rounded-xl` | `calc(var(--radius) * 1.5)` | 6px |
| `rounded-2xl` | `calc(var(--radius) * 2)` | 8px |
| `rounded-3xl` | `calc(var(--radius) * 3)` | 12px |
| `rounded-4xl` | `calc(var(--radius) * 4)` | 16px |

Use the scale consistently. Inner media and nested surfaces should have a visibly related, usually smaller, radius than their parent.

## Elevation and Depth

- Use `shadow-surface` for cards and raised page content.
- Use `shadow-overlay` for floating layers such as dialogs, menus, and popovers.
- Use `shadow-field` for form controls when the component applies it.
- Dark mode intentionally removes surface and field shadows and gives overlays a subtle inset edge.
- Do not stack custom shadows on HeroUI components that already provide elevation.

## Components

- **Buttons:** Use semantic variants. `primary` is the main action, `secondary` is an alternative, `tertiary` is dismissive or low emphasis, `outline` is a bordered low-emphasis action, `ghost` is an unbordered low-emphasis action, `danger` is destructive, and `danger-soft` is a quieter destructive action. Prefer one primary action per context and reach for an existing variant instead of restyling a button.
- **Cards and surfaces:** Use `Card`, `Surface`, and semantic surface utilities. Create hierarchy with surface levels and spacing before adding borders.
- **Forms:** Use HeroUI field components so background, foreground, placeholder, border, focus, radius, validation, and disabled states stay consistent.
- **Status:** Use success, warning, and danger only for their semantic meanings. Pair color with text or an accessible label.
- **Overlays:** Use HeroUI `Modal`, `Popover`, `Dropdown`, and `Tooltip` components so focus management, dismissal, and keyboard behavior remain accessible.
- **Compound components:** Compose exported parts instead of replacing component behavior with custom divs. Preserve labels, roles, and keyboard interactions.

## Interaction

- Use HeroUI and React Aria states, including `data-hovered`, `data-pressed`, `data-focus-visible`, `data-disabled`, and `data-invalid`.
- Every interactive element needs a visible focus indicator. The default focus color is the accent, with a 2px ring offset.
- The default disabled opacity is `0.5`; disabled controls use a not-allowed cursor.
- Use motion to clarify state changes, not as decoration. Respect reduced-motion preferences.
- Keep icon-only and touch controls large enough to target and give them accessible labels.

## Do

- Use HeroUI components and their documented variants before writing custom primitives.
- Use semantic tokens as implementation handles and raw values only for reference or migration.
- Use the same token in light and dark modes and let CSS resolve the current value.
- Establish hierarchy with content order, spacing, type, and surface level.
- Reserve accent for meaningful emphasis and keep status colors semantic.
- Use separators sparingly; prefer spacing for ordinary grouping.
- Keep active, selected, loading, invalid, and disabled states visible and accessible.

## Don't

- Don't hardcode colors, shadows, radii, or spacing when a HeroUI token or Tailwind utility exists.
- Don't use raw neutral palette classes such as `gray-*` where a semantic surface or content token applies.
- Don't use color alone to communicate state or hierarchy.
- Don't mix unrelated radius, padding, or elevation systems in one view.
- Don't make static content look interactive with hover or pressed effects.
- Don't overuse cards, borders, badges, icons, accent color, or nested heavy surfaces.
- Don't bypass HeroUI interaction behavior with inaccessible custom markup.

## Source of Truth

- Applied theme: `src/app/globals.css` (Uber preset, exported with the Theme Builder's own generator, plus the AA overrides above)
- Theme Builder: https://heroui.com/themes
- Default theme variables (derived tokens the preset does not set): https://github.com/heroui-inc/heroui/blob/v3/packages/styles/themes/default/variables.css
- Tailwind token mappings: https://github.com/heroui-inc/heroui/blob/v3/packages/styles/themes/shared/theme.css
- Component documentation: https://heroui.com/docs/react/components
- Colors: https://heroui.com/docs/react/getting-started/colors
- Theming: https://heroui.com/docs/react/getting-started/theming
- Design principles: https://heroui.com/docs/react/getting-started/design-principles

When this file and the current package disagree, follow the installed HeroUI version and its theme CSS.
