# AI Facility

An underground command facility for running AI agents across several businesses. Each
business is a wing with its own rooms, crew and budget. The first wing is an Etsy shop.

You can watch every agent move between rooms as work moves through each stage. Anything
that needs you lights up red, and nothing goes out to customers or the shop without
your approval.

**Status: Phase 1 (demo mode).** The agents are simulated so you can try the facility
before any AI model or shop is connected. Nothing costs money.

## Run it on the Mac mini

Requires Node.js 20 or later.

```sh
npm install
npm run dev
```

Then open http://localhost:5173.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

See `CLAUDE.md` for the rules every change must follow.
