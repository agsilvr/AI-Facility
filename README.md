> Current reliability and operating status: [audit](docs/reliability-2026-10-30/AUDIT.md) · [product-to-profit plan](docs/reliability-2026-10-30/OPERATING-PLAN.md). Target: $10,000/month profit after costs; actual profit is unconnected. Production remains paused.

# AI Facility

The owner-requested target is automatic product selection and operation through
publishing. See [automation status and account-linking checkpoints](docs/AUTOMATION.md)
for the implemented selection flow and the remaining connection work. The live
publisher remains disconnected; final per-item approval is still enforced today.

An underground command facility for running AI agents across several businesses. Each
business is a wing with its own rooms, crew and budget. The first wing is an Etsy shop.

You can watch every agent walk between rooms as work moves through each stage, on a
retro pixel-art map of a base dug into the dirt, seen from above like a base-building game.
The Command Center sits in the middle, with the Vault, the Security checkpoint and the
Shipping Dock across the hall from it. Each business is its own district beside the core, its
rooms in the order its work flows: for the Etsy shop, a Research Lab, a Design Studio and a
Factory Line that makes clothing, plus Comms for customer messages. Drag to move around,
scroll or pinch to zoom, and click a room or a crew member to see what they're doing.
Anything that needs you lights up red, and nothing goes out to customers or the shop
without your approval.

**The crew's models.** Public research runs on local Qwen 3.5 9B. The elected operator
handles writing through its official subscription CLI; Codex is the current temporary
operator. Factual briefings and file checks run in code. Image generation still requires
the official Codex chat handoff. DeepSeek's reader is not connected. The Crew and System
tabs distinguish actual assignments, availability and unverified sign-in.

**Live or demo.** Live mode runs actual local workers, subject to the saved production
pause, role limits and budgets. Automatic product creation defaults off. Research needs
usable evidence; pricing needs verified costs. Failures stop for an explicit retry.
Publishing needs a verified connector and exact approval; signing into Printify alone
does not implement that connector. Use `--demo` for the labelled simulated crew.

**Status: Phase 3 (real crew, not yet publishing).** The facility runs as a background
service on the Mac mini, keeps its data in a local database, and carries on when the browser
is closed. The real crew drafts products and briefings; nothing reaches Etsy yet.

Publishing is capped at three attempts per rolling 24 hours, at least four hours
apart, with reservations saved before execution. Failures count; interrupted attempts
cannot be replayed. See [the Etsy operating standards](docs/ETSY-OPERATING-STANDARDS.md)
for enforced limits and the remaining requirements before connecting a publisher.

## Install on the Mac mini

Sign in as the Business macOS user, install Node.js 22.13 or newer from https://nodejs.org,
then from this folder run:

```sh
./scripts/install-macos.sh
```

The installer opens a page where you choose your approval PIN (6 to 12 digits). Only someone
with the PIN can approve, send back or restart work; pausing never needs it. If you close that
page before choosing, run the installer again for a fresh one.

After that, open http://localhost:8787. The service restarts itself if it stops and picks up
where it left off. Use `--at-boot` to start it when the Mac starts, before anyone logs in.
`./scripts/uninstall-macos.sh` removes the service (your data stays).

Data lives in `data/` and logs in `logs/` inside this folder. The only file written outside
it is the service definition in `~/Library/LaunchAgents`. By default only this Mac can open
the facility.

## Develop

```sh
npm install
npm run dev:server   # facility server on :8787
npm run dev          # screens with live reload on :5173
```

## Checks

```sh
npm run typecheck
npm test
npm run build
```

See `CLAUDE.md` for the rules every change must follow.

## Command workspace iteration

The dark workspace puts the branching facility on the left and Command, Jobs, Lab, Crew and System on the right. Click a crew member to see their actual assigned model, data access and work. Zoom is smooth and anchored to the pointer.

Claude normally leads writing; Codex can take command temporarily through the official app connection. Briefings use current ledger facts assembled by code. Handover retains jobs and approvals, fences late answers, and requires the owner's PIN when requested manually. Research tests can run on Qwen independently. Publishing and accounting remain unconnected. See [the design and handover notes](docs/DESIGN.md).

Scout analyzes a changed, usable evidence pack at most once every 24 hours while the
facility is running, independently of the product approval backlog. An unchanged analyzed
pack or expired source dates cause no automatic run. Saved tasks preserve this behavior
across restarts. Unfinished or failed notebooks block new automatic work; failures still
require an explicit retry. Lab can request reanalysis, which does not refresh source dates.

Notebook research analyzes the saved, dated public evidence pack locally. It makes no
requests to Etsy and does not collect fresh competitor prices or market data. Reports
retain their source dates and limitations. New Etsy data collection requires Etsy-approved
access, subject to its permissions and limits; no scraping or detection evasion is used.

## Shared live operation

The facility records work performed in official AI chats and tools as well as its server workers. Room indicators, shared work cards, crew assignments and Jobs counts read the same persisted ledger. A live external worker has a 90-second heartbeat lease; lost connections and restarts become blocked handoffs, with saved context retained and late results fenced out. Queued work is not counted as running. Real percentage completion is shown only when reported; live model calls no longer invent progress from elapsed time.

Use [the work bridge](docs/FACILITY-WORK.md) for every outside operation. It is a reporting and continuity connection, not automatic observation of an arbitrary AI application and not permission to publish. DeepSeek's separate app can be available while the facility reader remains unconnected; the System panel states that distinction. The first product's paused redesign, actual Printify ID, prior feedback and next step are saved in shared work ID `first-listing`. Its supporting evidence and handoff files ship under `docs/launch-2026-10-30/`.

Read [the owner's design manual](docs/DESIGN-QUALITY.md) before the next design or quality review. Old artwork remains superseded; this facility update does not resume that product or authorize publication.
