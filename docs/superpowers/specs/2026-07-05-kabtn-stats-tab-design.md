# Kabtn — Statistik-Tab: Mini-Spezifikation

**Datum:** 2026-07-05 · **Status:** Genehmigt (User: „Ja, genau so bauen")

## Umfang

Fünfter Dashboard-Tab „الإحصائيات / Statistics" pro Server, Zeitraum-Wahl **7/30/90 Tage** (Pill-Buttons, Standard 30):

- **4 Kennzahl-Kacheln:** Mitglieder (approximate_member_count via Discord), neue Mitglieder im Zeitraum (aus joined_at), Matches im Zeitraum, KI-Fragen im Zeitraum.
- **4 Diagramme** (Einzelserien — nie zwei Einheiten auf einer Achse):
  1. Mitgliederwachstum — Linie (2px), Cyan `#0891b2`; Datenquelle: tägliche Schnappschüsse (ab Aktivierung) + Fallback kumulierte joined_at-Kurve der aktuellen Mitglieder
  2. Matches pro Tag — Balken (4px runde Enden, 2px Lücken), Indigo `#6366f1`
  3. KI-Fragen pro Tag — Balken, Smaragd `#059669` (eigenes Mini-Chart)
  4. Zuhör-Minuten pro Tag — Balken, Bernstein `#d97706` (eigenes Mini-Chart, NEBEN #3 als Small-Multiples)
  Zusätzlich: Top-5-Spieler als horizontale Balken (Indigo) mit Namen direkt beschriftet.
- **„Zuletzt beigetreten"-Liste:** 12 neueste Mitglieder (Avatar, Name, Datum) aus Discord-REST.
- Palette **rechnerisch validiert** (dataviz-Validator, dark: alle Checks PASS, CVD ΔE ≥ 18.5). Einzelserien ⇒ keine Legenden; Titel benennen die Serie. Tooltips auf allen Marks; Text in Text-Tokens, nie in Serienfarbe. Charts intern `dir="ltr"` (Zeitachsen bleiben links→rechts), Container-Layout RTL-fähig.

## Daten & Backend

- **Neu `MemberSnapshot`** (packages/db): `guild_id`, `date` (YYYY-MM-DD, compound unique), `member_count`, TTL 400 Tage. Repo: `recordMemberSnapshot(guildId, count, dateKey)` (Upsert), `memberSnapshots(guildId, days)`.
- **Bot-Job** (apps/bot ready.ts): alle 6 h für jede Guild `recordMemberSnapshot(guild.id, guild.memberCount, todayKey())` — Kurve wird ab Aktivierung täglich wertvoller.
- **Usage-TTL 7 → 90 Tage** (UsageModel `expires`), damit die Nutzungs-Charts Historie haben (syncIndexes aktualisiert den TTL-Index beim Start).
- **Neue Aggregations-Repos** (packages/db, analytics-repo): `matchesPerDay(guildId, days)` (completed, nach completed_at-Tag), `aiUsageDaily(guildId, days)` (aus Usage), `newPlayersPerDay(guildId, days)` (Player created_at).
- **DiscordRest erweitert:** `listMembers(guildId, limit=1000)` (GET /guilds/{id}/members, braucht Members-Intent — im Portal aktiv) → `{id, username, avatar, joined_at}[]`; `getGuildCounts(guildId)` (GET /guilds/{id}?with_counts=true) → `approximate_member_count`. Beide im Fake mit Fixtures.
- **Neuer Endpunkt** `GET /api/guilds/:id/stats?days=7|30|90` (Session + GuildAccess, days Zod-validiert): `{ memberCount, joinedRecent[12], memberSeries, matchesPerDay, usageDaily, newPlayersPerDay, topPlayers[5], totals: {newMembers, matches, aiQuestions} }`. Discord-REST-Anteil 5 min pro Guild gecacht (In-Memory, wie Access-Cache-Muster).
- **Client:** neue Abhängigkeit `recharts`; `StatsTab.tsx` + Chart-Wrapper mit Neon-Glas-Stil; i18n-Keys `stats.*` in ar/en.

## Grenzen (ehrlich dokumentiert, auch im UI-Hinweis)

- Ausgetretene Mitglieder sind rückwirkend unsichtbar; exakte Verlaufskurve erst ab Schnappschuss-Aktivierung.
- joined_at-Fallbackkurve = nur aktuelle Mitglieder (Überlebende).

## Tests

DB: Snapshot-Upsert (ein Dokument pro Tag), Aggregations-Fenster (Tage außerhalb ausgeschlossen), Guild-Isolation. Web: stats-Route 403-Fremdzugriff, days-Validierung (400 bei days=5), Antwortform mit Fake-Fixtures. Client: Zeitraum-Wechsel refetcht (fetch-Stub), Kacheln rendern Werte.
