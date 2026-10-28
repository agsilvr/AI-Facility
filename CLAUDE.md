# AI Facility: rules for anyone building it

This repository is the AI Facility: an underground "command facility" that runs AI agents
for several businesses, starting with an Etsy shop. The owner does not code. Every change is
made by an AI (Claude, Codex or similar), so these rules are what keep it trustworthy.
Read them before every change and follow them without exception.

## What this system is

- **Local-first.** It runs on the owner's Mac mini, under a separate "Business" macOS user.
  No cloud databases or hosted services. The only things allowed to leave the machine are
  calls to AI model providers and to business platforms the owner connected (e.g. Etsy).
- **The ledger is the single source of truth** (`src/core/ledger.ts`). It lives in the local
  server (`server/`), which saves it to SQLite and pushes snapshots to the screens. The browser
  never changes state itself; it sends commands to the server. Agents and the view only read
  and change state through the ledger. The facility view must never show something the
  ledger doesn't record: no decorative fake activity outside demo mode, and demo mode is
  always labelled on screen.
- **Wings, not rewrites.** Each business is a wing (`src/core/seed.ts`): its own rooms,
  workflows, agents and budget. A new business is a new wing, never a fork of the core.

## Safety rules (non-negotiable)

1. **Nothing outward-facing happens without the owner's approval.** Publishing, sending a
   message to a customer, spending money, deleting anything on a platform: each must be a
   workflow stage marked `needsApproval`, or come after one. Add a test that proves it.
2. **Every wing has a hard monthly budget.** Dispatch stops for a wing at its cap. Never
   remove or bypass the check in `dispatch`. AI provider keys must also have a spending cap
   set at the provider.
3. **AI access goes through the owner's own subscriptions** (Claude Code, Codex) or a local
   model, using the official apps signed in on the Mac. Never build anything that extracts
   or reuses a subscription's login tokens. Cheap or private work goes to the local model;
   customer data never goes to providers the owner hasn't approved for it.
4. **Secrets never enter the repository.** API keys and tokens live in the macOS Keychain or a
   git-ignored `.env` file. Never log them, never send them to the browser.
5. **No unvetted third-party agent skills, plugins or MCP servers.** Read the code of anything
   that agents can call before adding it, and pin its version.
6. **Platform rules are product requirements.** Etsy: disclose AI use in listings, no
   bot-generated listings without the owner's creative review, at least one real photo or
   authorised mockup, and only Etsy-approved API access. If a feature would break a
   platform's terms, don't build it; tell the owner why.
7. **Fail closed.** If an agent errors, a budget can't be read, or a platform call fails,
   the task stops and shows up in "Needs you". Never retry silently into spending money.

8. **The server only answers this Mac** unless the owner opts in. It checks the Host header
   and refuses cross-origin or non-JSON commands. Keep those checks and their tests.

## Engineering rules

- TypeScript strict mode, React for the UI, the facility map drawn on canvas in
  `src/facility/`. Keep it dependency-light; justify every new package.
- `npm run typecheck`, `npm test` and `npm run build` must pass before any commit. CI runs
  them on every pull request.
- Every behaviour change comes with a test. Ledger and dispatch logic must stay fully covered.
- Changes go through pull requests, never straight to `main`. Each PR says in plain
  language what the owner will notice.
- Match the existing code style: small modules, comments that explain *why*, no dead code.
- After any UI change, run the app and look at it (desktop and narrow widths) before merging.

## Layout

- `server/`: local HTTP server, SQLite store, and the running facility (timer, saving).
- `scripts/`: macOS service install and uninstall.
- `src/client/`: the browser's connection to the server.
- `src/core/`: types, ledger, dispatch, seed data (wings, rooms, agents, workflows).
- `src/sim/`: demo mode with simulated agents and canned output.
- `src/facility/`: map layout, movement and the canvas renderer.
- `src/ui/`: top bar, sidebar panels (Needs you, Task flow, Crew, Log) and inspector.
