# Dark/light theme toggle — Design

**Date:** 2026-07-19 · **Status:** approved (owner picked: whole site)

## Goal

The site is dark-only (hardcoded slate/white-alpha utilities, dark body
gradient, zero `dark:` variants). Add a light mode for the WHOLE site with a
good-looking toggle in both navbars (dashboard Layout + LandingHeader).

## Design

**Mechanism — light as an override scope, dark stays the default.** Rewriting
every component with `dark:` variants would touch every class string in the
app. Instead: a `light` class on `<html>` activates a documented override
block in `styles.css` that re-skins the small set of shared utility patterns
the whole UI is built from (`bg-white/5|10`, `border-white/10|20`,
`text-slate-200..500`, `bg-slate-950/70`, header/footer surfaces, option
backgrounds) plus light variants for the bespoke landing scene (sky-gradient
hero instead of the space scene) — one file owns the theme, components stay
untouched. Escaped-class CSS selectors (`.light .bg-white\/5`) are the
mechanism; the block is commented as the single place light-mode colors live.

**Toggle:** a `ThemeToggle` component — animated sun/moon icon button, same
pill styling as the existing LangSwitcher — placed in the Layout header and
LandingHeader. State in `localStorage('theme')`, default dark (site
identity). An inline `<head>` script in `index.html` applies the stored class
before first paint (no flash). Toggle swaps the class on `<html>` live.

**i18n:** `theme.light` / `theme.dark` aria-labels in all six locales.

## Out of scope

Per-system `prefers-color-scheme` auto-detection (default is dark, explicit
toggle only). Refactoring components to semantic color tokens.

## Testing

- ThemeToggle: click adds/removes `light` on `<html>` and persists to
  localStorage; initial render respects stored value.
- i18n key-consistency suite covers the new keys automatically.
- Visual: manual pass over dashboard + landing in both themes.
