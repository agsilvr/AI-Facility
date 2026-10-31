# Reliability audit — 30 October 2026

Owner target: USD 10,000 per month **profit after costs**, confirmed in the audit chat. This is a target, not measured performance or a forecast. Production is paused. Maintenance is authorized. Keep unpublished Printify product `6ae53368aaf23a205705feee`; its prior artwork is superseded.

## What was actually broken

1. The global dispatcher was running while the durable product handoff said paused. Maintenance explicitly stopped global dispatch; owner PIN is still required to resume. Automatic product creation is separately disabled and now defaults off unless the saved policy is explicitly true.
2. The listing prompt requested a model-invented fair price without supplier quotes or fees. The writer now generates copy only. Price is null and approval is blocked until verified pricing is implemented; there is no hidden default price.
3. Research's JSON validator ignored `minItems`. Empty or incomplete comparisons could pass a schema that required three candidates. Minimum array sizes are now enforced.
4. A known citation ID was treated as sufficient evidence. Product families now require their own supplier evidence and relevant buyer evidence; duplicates, unknown citations and cross-family supplier substitutions fail. Evidence paragraphs and limitations are assembled from saved source notes by code. Concepts and ranking remain explicitly unvalidated model proposals. Live smoke tests exposed unsupported demand and rights claims inside creative fields; those answers were rejected, lexical claim checks and regression cases added, and validation steps moved to code. These bounded checks cannot prove every possible sentence true.
5. Old/malformed reports could feed products or crash the notebook display. Saved reports are checked structurally. Historical outputs remain readable, but new production requires the current evidence contract and source pack (30-day retrieval freshness limit). This is an internal refresh rule, not proof of current demand.
6. Automatic research repeated the same static sources every day. It now waits for a changed usable evidence pack; it does not manufacture freshness or accumulate catch-up runs. Manual reanalysis is still explicit. Product creation no longer falls back to evidence-free ideas.
7. Briefings mixed stale log messages with current records and called all historical completions recent. Current status is now assembled by code, with a rolling 24-hour completion window and no model call. No completed task is counted as revenue.
8. Enabled models could look available without verified authentication; a silent event-stream stall could leave activity marked live. Subscription connections now say sign-in unverified when idle. Explicit server heartbeats and a browser watchdog mark stale connections offline and reconnect for a fresh snapshot. DeepSeek remains disconnected.
9. PNG checks validated headers and compression but did not inspect alpha or visible bounds. Full scanline reconstruction now reports actual transparency and nontransparent bounds; empty and unsupported animated/transparency formats are refused. These checks do not certify visual quality or physical printing.
10. Revision notes were overwritten rather than retained, and image revision attempts were unlimited. Feedback is retained in task history. A fourth artwork request is blocked after three attempts, with earlier immutable files preserved.
11. An image could be attached to a waiting internal handoff while global production was paused. The HTTP boundary now rejects paused uploads before saving or advancing artwork.
12. The app did not connect the profit goal to the actual incomplete pipeline. Command now shows the saved target, actual status, the five readiness stages and a cost-explicit scenario calculator. Assumptions are not measured results or publishing authority.
13. Continuation review found that expired evidence could trigger another automatic analysis after 30 days. Scheduling now requires a current source pack before creating any new notebook; reanalysis cannot refresh retrieval dates. This was reproduced with and without a prior notebook, including restart recovery.
14. A saved keyword with a non-string JSON value could crash current-research eligibility, and edited summaries or removed limitations could still be accepted. Malformed creative metadata is rejected; factual summaries and limitations must match the code-owned contract as well as source notes.
15. README and design/access documents retained contradictory descriptions of daily reruns, AI briefings, model connections and navigation. They now describe the installed behavior consistently. The source manual and remaining product gates remain separate from file checks.

## Source audit

The three saved official Etsy trend references were reopened during this maintenance audit. Publication dates, book-interest context, pet-gifting figures and gallery-search figures/periods were checked against their pages. They support broad or historical category observations, not proposed-item sales or profit:

- https://www.etsy.com/seller-handbook/article/1521255894814
- https://www.etsy.com/seller-handbook/article/1362959156542
- https://www.etsy.com/seller-handbook/article/1473931456647

Competitor review snapshots and public supplier starting prices are historical observations; no new account quote or competitor sales validation occurred. StarNet was reviewed only as a benchmark for truthful activity and bounded autonomy: https://starnetos.com/docs/station and https://starnetos.com/docs/autonomy. No StarNet code, assets or integrations were installed.

## Still not built / not verified

- Unattended image generation through an authorized official subscription path. Current generation requires the official chat handoff.
- A supplier product/variant quote and mockup connector, durable write intentions and external-result reconciliation.
- A version-bound production package: exact product/provider, print area, artwork, placement, checked colors, mockups, verified costs and price. The design manual remains required; a file check is not that package.
- A verified Etsy publishing and orders/accounting connector, with platform authorization and existing publishing limits preserved.
- Measured conversion, return rates, acquisition costs and profit. No revenue forecast or success guarantee is made.

## Verification and continuity

Baseline: 319 tests passed before repair. Regression results, real local-reader smoke output, installation hashes and final UI observations are recorded alongside this file and in shared work `facility-reliability`. No production design was generated and no Printify or Etsy write was made by this audit.

Read `OPERATING-PLAN.md` for the ordered product workflow. Continue `first-listing` only after the owner resumes that product; do not duplicate its saved Printify shell. The repository's existing uncommitted work was preserved.
