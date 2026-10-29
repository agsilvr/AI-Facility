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
   workflow stage with an `action`, placed directly after a stage marked `needsApproval`.
   `src/core/policy.ts` enforces this shape and the server refuses to start if any wing breaks
   it. An approval binds to the exact draft the owner saw (`serializeDraft`); if the content
   changes, the action is blocked and the work goes back for review. Code that performs an
   action must check `ledger.mayAct(task)` first. Add a test for every new action.
2. **Every wing has a hard monthly budget.** Dispatch stops for a wing at its cap. Never
   remove or bypass the check in `dispatch`. AI provider keys must also have a spending cap
   set at the provider.
3. **AI access goes through the owner's own subscriptions** (Claude Code, Codex) or a local
   model, using the official apps signed in on the Mac. Never build anything that extracts
   or reuses a subscription's login tokens. Cheap or private work goes to the local model;
   customer data never goes to providers the owner hasn't approved for it (DeepSeek is not
   approved for customer data).
4. **Secrets never enter the repository.** API keys and tokens live in the macOS Keychain or a
   git-ignored `.env` file. Never log them, never send them to the browser, never pass them to
   an AI reader's environment.
5. **No unvetted third-party agent skills, plugins or MCP servers.** Read the code of anything
   that agents can call before adding it, and pin its version.
6. **Platform rules are product requirements.** Etsy: disclose AI use in listings, no
   bot-generated listings without the owner's creative review, at least one real photo or
   authorised mockup, and only Etsy-approved API access. If a feature would break a
   platform's terms, don't build it; tell the owner why.
7. **Fail closed.** If an agent errors, a budget can't be read, a check can't run, or a platform
   call fails, the task stops and shows up in "Needs you". Never retry silently into spending
   money.
8. **The server only answers this Mac** unless the owner opts in. It checks the Host header
   and refuses cross-origin or non-JSON commands. Keep those checks and their tests.
9. **Readers never act; actors never read outside text.** Any AI step that reads something from
   outside (a buyer message, a web page, a review) runs through `server/agents/reader.ts`: no
   tools, no MCP, no settings or memory, an empty temp folder, a scrubbed environment, the
   outside text fenced with a random marker, and output checked against a schema. Actions are
   plain code that use only approved content. Never give a reader a tool.
10. **Every draft is checked before the owner sees it** (`src/core/safety.ts`): links, emails,
    phone numbers, off-Etsy payment, hidden characters, instruction-like text, Etsy limits and
    AI disclosure. A blocking finding makes approval impossible. Never weaken a check to make a
    draft pass; fix the drafting instead, and add the case to the tests.
11. **Every AI call is audited** in the append-only `audit` table (the database refuses edits
    and deletes). It stores fingerprints (SHA-256), never the customer's text.
12. **The kill switch holds.** Pausing the facility is saved and survives a restart. Nothing
    may resume it except the owner.
13. **Smallest access, explained first.** Before asking the owner for any permission, folder
    access or remote session, say exactly what it covers, why it's needed, and for how long.
    The facility touches only its own folder (`~/ai-facility`) plus one file,
    `~/Library/LaunchAgents/com.aifacility.server.plist`. Never use `sudo`, and never touch the
    Keychain, browsers, other folders, other users' files or the owner's Apple Account.
14. **The lockdown settings stay locked.** `.claude/settings.json` limits what any AI working
    in this folder can read, run and reach. Never loosen it, never add `allow` rules to it, and
    keep `server/lockdown.test.ts` passing. `SECURITY.md` explains the threat model.

## Engineering rules

- TypeScript strict mode, React for the UI. The facility is drawn in 3D with three.js in
  `src/facility3d/`, with the 2D canvas map in `src/facility/` as the fallback. Both read the
  same layout and the same room status (`src/facility/status.ts`), so they can't disagree.
  Keep it dependency-light; justify every new package. three.js is the one rendering
  dependency: pinned to an exact version, bundled locally, and loaded only for the 3D view.
  Textures and fonts are generated in code; nothing is fetched at runtime.
- `npm run typecheck`, `npm test` and `npm run build` must pass before any commit. CI runs
  them on every pull request.
- Every behaviour change comes with a test. Ledger and dispatch logic must stay fully covered.
- Changes go through pull requests, never straight to `main`. Each PR says in plain
  language what the owner will notice.
- Match the existing code style: small modules, comments that explain *why*, no dead code.
- After any UI change, run the app and look at it (desktop and narrow widths) before merging.

## Layout

- `server/`: local HTTP server, SQLite store (state, history, audit), and the running facility.
- `server/agents/`: the locked-down AI reader.
- `scripts/`: macOS service install and uninstall.
- `src/client/`: the browser's connection to the server.
- `src/core/`: types, ledger, dispatch, safety checks, workflow policy, seed data (wings,
  rooms, agents, workflows).
- `src/sim/`: demo mode with simulated agents and canned output.
- `src/facility/`: map layout, movement, room status and the 2D canvas renderer.
- `src/facility3d/`: the 3D facility (scene, rooms, crew, camera and quality helpers).
- `src/ui/`: top bar, sidebar panels (Needs you, Task flow, Crew, Log) and inspector.
