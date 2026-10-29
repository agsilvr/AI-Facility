# AI Facility

An underground command facility for running AI agents across several businesses. Each
business is a wing with its own rooms, crew and budget. The first wing is an Etsy shop.

You can watch every agent walk between rooms as work moves through each stage, on a
retro pixel-art map of a base dug into the dirt, seen from above like a base-building game.
Each business is its own district along the main hall: a research lab, a design studio, a
factory line (clothing, for the Etsy shop), comms, plus the shared command center, security
checkpoint, vault and shipping dock. Drag to move around, scroll or pinch to zoom, and click
a room or a crew member to see what they're doing.
Anything that needs you lights up red, and nothing goes out to customers or the shop
without your approval.

**Status: Phase 2 (local server, demo crew).** The facility runs as a background service on
the Mac mini, keeps its data in a local database, and carries on when the browser is closed.
The crew is still simulated, so nothing costs money.

## Install on the Mac mini

Sign in as the Business macOS user, install Node.js 22.13 or newer from https://nodejs.org,
then from this folder run:

```sh
./scripts/install-macos.sh
```

Open http://localhost:8787. The service restarts itself if it stops and picks up where it
left off. Use `--at-boot` to start it when the Mac starts, before anyone logs in.
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
