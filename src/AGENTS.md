# Frontend — Agent Guide (`src/`)

## Why this exists

The React + TypeScript + Vite frontend is a **thin view over Rust state**. It
renders the sidebar and workspace and calls Tauri commands; all persistence and
process lifecycle live in Rust. If logic isn't purely presentational, it belongs
on the Rust side, not here.

## Rules

- **Strict TypeScript.** No `any`, no `@ts-ignore` / `@ts-expect-error`. Fix types
  properly.
- **Components stay small** (~200 lines max). Split when they grow.
- **No `<StrictMode>`.** `main.tsx` renders `<App />` bare, on purpose. StrictMode's
  dev-only double-invoke of effects would spawn and then immediately tear down real
  OS resources (terminal PTYs, and later embedded webviews) — those aren't
  idempotent React state, so the double-mount actively breaks them. Don't re-add it.
- **Tailwind v4, no config file.** Styling is `@import "tailwindcss"` in
  `index.css` plus utility classes, wired through the `@tailwindcss/vite` plugin.
  Do **not** add `tailwind.config.js` or a PostCSS pipeline — that's the v3 way and
  will fight the v4 setup. The color theme is defined once as `@theme` tokens in
  `index.css` (the single source for chrome colors, e.g. `bg-sidebar`,
  `text-foreground`). Biome's CSS parser rejects `@theme` as an unknown at-rule, so
  `biome.json` sets `css.parser.tailwindDirectives` — that flag exists only to teach
  the linter v4 syntax, not to relax or swap tooling.
- **No magic numbers.** Ports, timeouts, limits, and the project **color palette**
  are named constants. The palette lives in exactly one place (`src/lib`) and is
  the single source of truth — Rust just stores whatever hex string it receives.
  Never duplicate the palette in Rust or a component.
- **IPC conventions.** Tauri v2 maps camelCase JS argument keys to snake_case Rust
  parameters, so call commands with camelCase (e.g. `orderedIds`). Mutating
  commands return the **full** updated state; adopt that return value instead of
  optimistically mutating local state — it keeps the UI drift-free. Keep the TS
  types mirroring the Rust structs (camelCase).
- **Accessibility rules are intentionally relaxed.** Biome's
  `noStaticElementInteractions` and `useKeyWithClickEvents` are **off** in
  `biome.json` on purpose: this is a single-user local desktop tool, not a public
  web page. Clickable/draggable rows and the color-picker backdrop don't need ARIA
  roles or duplicated keyboard handlers (project switching already has Cmd+1..9).
  Don't re-enable them or litter per-line `biome-ignore` comments. Revisit only if
  genuinely public-facing web content is ever added.

## Testing: what, and why

Vitest tests **pure logic in `src/lib` only** — e.g. path→name parsing and palette
cycling — because that logic has real edge cases and is deterministic. These tests
assert behavior (inputs → outputs), not internals.

Do **not** add React component render tests, DOM-interaction tests, or Tauri
`invoke` mocks. They are brittle, break on harmless markup changes, and cost more
to maintain than they catch in a one-person tool. Verify the UI by running the app.
