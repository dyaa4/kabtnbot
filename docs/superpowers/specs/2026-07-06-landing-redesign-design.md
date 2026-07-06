# Landing-Redesign: Neon-Gaming verfeinert

**Datum:** 2026-07-06 · **Status:** genehmigt

## Ziel

Komplettes Redesign der Startseite (alle Sections), Richtung „Neon-Gaming
verfeinert": dunkle Indigo/Cyan-Identität und Roboter-Maskottchen bleiben,
aber mit klarem Section-Rhythmus, Glass-Cards, strafferer Typo-Hierarchie und
dezenteren Animationen. Arabisch-first (RTL), alle Texte über i18n (ar + en).

## Struktur

1. **Header** — sticky, Glas (backdrop-blur + Border), Anker-Nav
   (المزايا · كيف يعمل · الأسعار · الأسئلة, ab `md`), Sprachumschalter + Login.
2. **Hero** — Sternenhimmel/Auroras/Roboter bleiben, reduziert: Badge-Chip
   über der H1, Gradient-Headline, Tagline, zwei CTAs (Invite primär,
   Discord-Login sekundär), Guild-Zähler als Social Proof.
3. **Features als Bento-Grid** — große Voice-Karte (USP: «يا كابتن»-Chip +
   Dialekt-Pills aus `settings.dialect.*`) + Karten für Schutz, Statistiken,
   Willkommensbilder, Bot-Profil. Inline-SVG-Icons, Hover-Glow.
4. **So funktioniert's** — 3 nummerierte Schritte (einladen → Dashboard →
   Kabtn übernimmt) mit Verbindungslinie, Invite-CTA am Ende.
5. **Pricing** — zwei Pläne wie bisher; Checkmark-Kreise, Premium mit
   Gradient-Rahmen + „قريباً"-Badge, Free-Karte mit Invite-CTA.
6. **FAQ** — 5 native `<details>`-Accordions (kostenlos? Berechtigungen?
   Dialekte? Datenschutz? Premium wann?), RTL-sicher, kein JS.
7. **CTA-Band** — Gradient-Panel mit großem Invite-Button.
8. **Footer** — Brand + Kurzbeschreibung, Spalten Produkt-Anker/Rechtliches,
   Copyright.

## Technik

- `pages/Landing.tsx` wird reine Komposition; Sections als kleine Komponenten
  in `components/landing/` (Header, Hero, Features, HowItWorks, Pricing, Faq,
  CtaBand, Footer). Gemeinsames `SectionHeading`-Muster.
- `/api/meta` (inviteUrl, guilds) wird einmal in Landing geladen und an die
  Sections gereicht — kein neuer Server-Code.
- Bestehende `hero-*`-Keyframes in styles.css bleiben; neue Animationen
  minimal, alle hinter `prefers-reduced-motion` abgeschaltet.
- Neue i18n-Keys: `landing.nav.*`, `landing.badge`, drei zusätzliche
  Feature-Karten, `landing.how.*`, `landing.faq.*`, `landing.ctaBand.*`,
  `footer.tagline`/`footer.product`/`footer.legal`.
- Tests: Landing.test.tsx wird um Smoke-Assertions erweitert (Nav-Anker,
  Bento-Voice-Karte mit Dialekt-Pills, How-it-works, FAQ-Accordion, CTA-Band,
  Footer-Links, Invite-URL aus meta). Bestehende Pricing-/Social-Tests bleiben
  gültig.
