# Touchline PoC

Offline-first PWA for grassroots youth coaches: set up a team and squad, record matches live, track training attendance and see squad stats. Works with no signal and syncs to a Neon Postgres database when online.

Live app: https://73bobster.github.io/TouchLine/ (GitHub Pages) · Licence: MIT

## What it does
- **Roles:** admin (superuser), coach, reviewer. Sign in with email and password; join a team with an invite code.
  - Coach: manage team, squad, matches, match log, attendance.
  - Reviewer: read-only access to matches (including live), stats, logs, summaries, attendance.
  - Admin: sees every team; must assign themselves as a coach of a team before editing it. Only admins create teams.
- **Three ways to record a match** (switchable before and during a match): buttons; drag-and-drop on a pitch (drag a player onto the goal, an action, the bench or a team-mate); tap the pitch (tap a player for an action popup, then a "how" popup).
- **Squad stats** (read only): selected, played, started, goals, assists, shots, key passes, saves, key defending, cards, attendance.
- **Attendance** for training and team events: on time, late (minutes), left early (minutes), absent with a reason (notified in advance, no-show, ill, injured, other).
- **Editable match log:** coaches can edit, add and delete events, even after the match.
- Squad import from a pasted list, a CSV/text file, or a photo of a team sheet (OCR).
- Responsive from small phones to desktop (bottom tabs on phones and tablets, sidebar on laptops).

## Files
- `index.html`, `sw.js`, `manifest.json`, icons: the static PWA (no build step).
- `db/schema.sql`: Postgres schema, roles and row-level security for Neon.

## Neon setup (already done for the live project)
Neon project `touchline` (aws-eu-west-2) with Managed Better Auth and the Data API enabled. Endpoints are set at the top of `index.html` (`AUTH_URL`, `REST_URL`). To use your own project: enable Auth and Data API, run `db/schema.sql`, add your site origin as a trusted domain, and change the two URLs.

**First admin:** sign up in the app, then in the Neon SQL editor run
`update public.profiles set is_superuser = true where email = 'you@example.com';`
(Admin is never settable from the app.)

## Security notes
- All data access is enforced by row-level security in the database, not by the app.
- Anonymous Neon tokens share one identity, so the app requires an email account.
- Sign-in uses cross-site cookies; some browsers (Safari with "Prevent Cross-Site Tracking") block them.
- This is a proof of concept: no email verification or password reset yet.

## Run locally
`python3 -m http.server 8080` then open http://localhost:8080, or http://localhost:8080/?local=1 for the no-account demo (data stays on the device).
