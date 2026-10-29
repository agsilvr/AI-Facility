# AI Facility

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

**The crew's models.** Research runs on Qwen 3.5 9B on the Mac, with DeepSeek taking public
research when Qwen is busy. Claude writes every listing, reply and daily briefing. Codex, on
your ChatGPT subscription, draws the designs, with type-only designs drawn in code when it's
busy. DeepSeek runs on your existing credits; nothing else pays per call. The Crew tab shows which model each crew member is using and what each has spent.

**Status: Phase 2 (local server, demo crew).** The facility runs as a background service on
the Mac mini, keeps its data in a local database, and carries on when the browser is closed.
The crew is still simulated, so nothing costs money.

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
