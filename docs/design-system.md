# Design System

Developer OS uses a restrained engineering-focused visual system. The product UI and landing page must share the same brand foundation so the public marketing experience and authenticated workspace feel like one product.

## Core Palette

Primary colors:

| Token | Name | Hex | Usage |
| --- | --- | --- | --- |
| `quantum-blue` | Quantum Blue | `#2457FF` | Primary actions, active navigation, focus states, brand accents, data highlights |
| `ice-glass` | Ice Glass | `#DFF7FF` | Soft surfaces, calm panels, subtle highlights, secondary backgrounds |

All landing page and in-app design system work must be created from this palette first.

## Usage Rules

- Use `Quantum Blue #2457FF` as the main brand color for high-emphasis UI: primary buttons, active navigation, focus states, selected controls, and important product accents.
- Use `Ice Glass #DFF7FF` as the supporting brand color for background bands, hover states, selected surfaces, soft cards, and calm UI depth.
- Keep neutral grays available for borders, disabled states, body copy, and dense dashboard layout, but do not introduce a competing brand hue without a documented reason.
- Accent colors for semantic states are allowed only when they carry meaning: success, warning, danger, info.
- The landing page may use richer composition and motion, but it must still derive its visual identity from Quantum Blue and Ice Glass.
- The authenticated app should stay quiet, fast, and operational: use the palette with restraint and prioritize scanability.

## Implementation Notes

- Create Tailwind/CSS tokens for both colors before redesigning large surfaces.
- Prefer semantic tokens such as `brand-primary`, `brand-surface`, `brand-muted`, and `brand-border` over raw hex usage in components.
- Any future component library or shadcn customization should map back to these brand tokens.
- Do not copy the color system from external landing page references. References can inform structure and interaction, not the Developer OS palette.
