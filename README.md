# Cobuildy

Platform that finds, analyses and raises capital for real estate development projects in Spain and Portugal.
An AI agent works for the developer and for the investor. Humans approve every send. Success fee only.

## Repository layout

- `supabase/migrations/` database schema, security rules and workflow (Supabase project `cobuildy`, region `eu-west-1`)
- `prototypes/` clickable HTML prototypes (landing, developer workspace, investor workspace). Example data only.

## Backend rules enforced in the database

| Rule | Where |
| --- | --- |
| Anyone can register (Google or email link) and picks developer or investor in `complete_signup`. admin and expert exist only through an approved invitation. | `handle_new_user`, `complete_signup` |
| Invitation emails go out only after an admin approves them (`approve_invite`). | `invitations.status` |
| Developers never read the `investors` table. Investor names are hidden until both sides signed the NDA. | RLS + `project_deals()` |
| Investors see anonymised teasers only for deals sent to them, and the full project only after the NDA. | `list_teasers()`, RLS on `projects` |
| Data room documents are visible only if the developer shared them with that investor. | RLS on `project_docs` |
| Project status changes only through functions (`submit_teaser`, `approve_teaser`, `launch_wave`). Expert approves the teaser, developer confirms each wave. | column privileges + functions |
| Deal steps (interest, NDA, data room, questions, answers, term sheet talk) go through one state machine, `deal_action()`, with an event log. | `deal_action`, `deal_events` |
| Investor must declare qualified status and pass KYC before signing an NDA. | `deal_action('sign_nda')` |
| Matching: unknown never excludes. Hard criteria are geography, asset, instrument, ticket. A licence gap means "later". | `match_project()` |

## Deal stages

`sent` → `interested` → `nda_sent` → `room` → `shared` → `qa` → `answered` → `ts` → `call`, or `passed` at any point.

## Status

Done: schema, security rules, matching, deal workflow. Tested end to end in a rolled-back transaction.
Not done yet: web app, email sending (needs a mail provider), e-signature and KYC providers, import of investors from the CRM, document storage, AI functions.

## Setup notes

- Create the first admin by signing in with the invited address (`dv@cobuildy.com` is pre-approved).
- Keep service role keys and the Anthropic API key out of git. Use Supabase secrets.

## Web app (`web/`)
Vite + React + TypeScript SPA talking to Supabase directly (RLS + RPC, no server).
```
cd web && cp .env.example .env.local   # URL + publishable key
npm install && npm run dev             # npm test, npm run build
```
Hosting: Cloudflare Workers (static assets, see web/wrangler.jsonc) or Vercel, root `web/`, build `npm run build`, output `dist`. In Supabase Auth set Site URL and Redirect URLs to the deployed origin. Sign-in is Google or a magic link; new accounts choose a role on first sign-in. Staff roles still need an approved invitation (Admin → Invitations). Google needs an OAuth client whose redirect URI is `https://<project>.supabase.co/auth/v1/callback`, entered under Supabase Auth → Providers → Google. Answers given to the landing agent are kept in the browser and imported into the first project (`web/src/lib/carry.ts`).

## AI agent (project chat)

The project page is a guided profile: a chat, the profile it fills (31 fields in 8 sections) and a readiness panel. The field model (questions, answer options, gates, weights) lives in `web/src/lib/fields.json`. After changing it run `node scripts/sync-agent-fields.mjs` and redeploy the function.

Answers are saved straight away (`profile` jsonb plus the matching columns, `stage` and `readiness`) and every answer can be undone. Suggested answers are saved without calling the model. Free text goes to `supabase/functions/agent-chat`, which runs with the caller's JWT, asks the Anthropic API which fields the text answers and returns validated updates; it never writes to the database. Usage is logged in `agent_calls` (`AGENT_DAILY_LIMIT`, default 300).

Secrets (Supabase → Edge Functions → Secrets): `ANTHROPIC_API_KEY` (required), `AGENT_MODEL` (optional, default `claude-sonnet-5-5`).
