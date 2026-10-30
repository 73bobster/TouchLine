# Touchline PoC

Offline-first PWA for grassroots youth coaches: set up a team and squad, then record a match live (lineups, goals, assists, shots, saves, subs, cards, notes).

- `index.html`, `sw.js`, `manifest.json`, icons: the installable PWA (static, no build step). Data is stored in the phone's localStorage.
- `db/schema.sql`: Postgres schema for Neon, with row-level security per signed-in user.
- Neon project `touchline` (aws-eu-west-2): Managed Better Auth and Data API are enabled.
  - Data API: `https://ep-icy-union-zai4i905.apirest.c-2.eu-west-2.aws.neon.tech/neondb/rest/v1`
  - Auth: `https://ep-icy-union-zai4i905.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth`

## Status
Cloud sync from the app is not wired up yet (see open questions in the project notes). Anonymous sign-in is not usable for per-coach data because all anonymous tokens share one identity; email accounts work and RLS isolates users.

Live app: https://73bobster.github.io/TouchLine/ (GitHub Pages). Licence: MIT.

## Run locally
`python3 -m http.server 8080` in this folder, then open http://localhost:8080.
