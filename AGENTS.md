# AI Facility: notes for Codex

Read `CLAUDE.md` before every change and follow every rule in it. It is the rulebook for any
AI building the facility, not only Claude. This file adds only what is different for Codex.

- **Your fence is `.codex/config.toml`**, the twin of `.claude/settings.json`: commands write
  only inside this folder, have no network and see no secrets. Never loosen either file;
  `server/lockdown.test.ts` checks both.
- **Never read `./data`** (the database and the owner's PIN setup code) or `.env`.
- **Never touch a login.** Don't open, copy or use `~/.codex/auth.json` or any other saved
  sign-in, and never call ChatGPT's or Claude's private web endpoints. Subscriptions are only
  used by running their official apps (rule 3).
- **Installing is the owner's call.** Only when they ask: `git pull origin main`, then
  `./scripts/install-macos.sh` with no flags (never `--at-boot`, never `sudo`). It needs the
  owner's yes for the network and for its one file outside this folder,
  `~/Library/LaunchAgents/com.aifacility.server.plist`. Then check
  `http://localhost:8787/api/health` and show the last 40 lines of `logs/server.log`. The
  owner sets their PIN on the page the installer opens; never open or read it for them.
- **Changes go through a pull request**, with `npm run typecheck`, `npm test` and
  `npm run build` passing first.
