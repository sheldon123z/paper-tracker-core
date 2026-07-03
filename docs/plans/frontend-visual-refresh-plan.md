# Frontend Visual Refresh Plan

## Summary
- Refresh the entire frontend visually without changing routes, state shape, API contracts, auth behavior, or page functionality.
- Keep the login page as the visual source of truth, then extend it into a stronger futuristic system with Apple-inspired frosted-glass surfaces.
- Locked decisions: stronger futuristic direction, `Orbitron + Exo 2` globally, preserve the current light/dark toggle, and introduce Apple-style frosted glass for high-frequency cards.

## Key Changes
- Establish one global visual system in `frontend/src/index.css` and `frontend/tailwind.config.js`.
- Replace the generic SaaS token set with login-derived research-tech tokens for canvas, panel, glow, accent, glass, and blur depth.
- Define a glass hierarchy:
  - `glass-subtle` for dense utility shells and list wrappers.
  - `glass-medium` for default cards, panels, settings blocks, and most content containers.
  - `glass-premium` for hero cards, AI search cards, selected panels, and modal shells.
- Unify navigation and shell surfaces:
  - floating frosted sidebar,
  - glass tab bar,
  - consistent SVG iconography instead of emoji.
- Restyle shared primitives:
  - `Card`, `Button`, `Input`, `Badge`, `Modal`, `Select`, `Skeleton`, `EmptyState`, `Toast`.
- Apply the same material system across dashboard, papers, feeds, tags, duplicates, settings, assistant, workflow, and paper detail views.
- Re-theme AI and Copilot surfaces so smart-agent result cards, especially search cards, use premium frosted glass with stronger depth and cleaner metadata grouping.

## Test Plan
- Smoke test login, dashboard, feeds, papers, tags, duplicates, settings, assistant, workflow.
- Confirm unchanged behavior for auth redirects, theme persistence, paper tabs, filtering, sorting, batch actions, assistant sessions, and workflow history.
- Validate layout at `375px`, `768px`, `1024px`, and `1440px` in both light and dark themes.
- Check glass-material quality:
  - AI search cards visibly use premium frosted glass,
  - standard cards remain readable,
  - text and badges preserve contrast,
  - hover/focus states do not cause layout shift.
- Accessibility:
  - visible focus states,
  - `prefers-reduced-motion` respected,
  - no horizontal scroll on mobile,
  - no emoji UI icons in rendered frontend.

## Assumptions
- Apple-style frosted glass is treated as a material system for cards and panels, not a reason to change information architecture or reduce density.
- Existing login page remains functionally unchanged and continues to anchor the visual system.
- Implementation prefers local CSS/Tailwind primitives over new animation or design dependencies.
