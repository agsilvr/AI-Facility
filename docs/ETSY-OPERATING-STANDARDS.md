# Etsy operating standards

Owner policy, set October 30, 2026. These controls limit activity and preserve
review. They are not Etsy-approved safe-volume thresholds and cannot guarantee
that Etsy will not flag a shop. Do not build behavior intended to disguise
automation or bypass Etsy's controls.

## Enforced in the facility

- At most **three publishing attempts per rolling 24 hours**, shared by every
  worker and workflow using `etsy.publishListing`. Three is a ceiling, not a
  production target. There is no catch-up burst after downtime or midnight reset.
- At least **four hours between attempts** for operational pacing and review.
  This is a fixed business rule, not simulated human behavior.
- An attempt reserves its slot before an actor is assigned. The server saves
  that reservation synchronously to SQLite; a storage error stops assignment.
  Failed, paused and interrupted attempts still count. Restarting, pruning
  finished tasks, or resetting monthly budgets does not reset this history.
- The same task or exact listing content cannot acquire another attempt. An
  active actor can finish only its own reserved run. After interruption, no
  automatic replay is permitted, even after the daily window has elapsed.
- Exact-content approval is still required, expires after 24 hours and is used
  once. A delayed listing may therefore need fresh approval. Researchers and
  writers have no publishing capability. Local draft work does not use quota.
- Existing draft validation, role checks, monthly budgets, owner PIN protection,
  failure cards and the persistent kill switch remain mandatory.

These limits govern facility activity only. They cannot observe manual uploads
or another integration. Before connecting publishing, all publishing sources
must share a shop-level counter or be reconciled before each attempt. Five per
day is not enabled; any increase needs an explicit owner-requested policy change.

## Requirements before a publisher can be connected

Publishing and Printify are currently unconnected. The following are connection
requirements, not claims that an Etsy integration already enforces them:

1. Use only Etsy-authorized access for the approved purpose, with the owner's
   OAuth consent and minimum scopes. Do not substitute browser scraping or
   private endpoints when authorization is unavailable.
2. Honor the app's actual queries-per-second and rolling daily request quotas.
   Listing counts and API request counts are separate budgets: one listing may
   require several calls. On `429`, pause, honor `Retry-After`, and require review
   before retrying a write. No silent write retries or quota circumvention.
3. Stop shop writes and show a clear owner action on access denial, authentication
   failure, a security challenge, account warning, listing removal or restriction.
   Never retry through another account, proxy, fingerprint or identity.
4. Persist an intent before each external write and record the platform listing
   ID and response afterward. Reconcile timeouts and interrupted writes against
   Etsy before permitting another attempt. Implement an owner-authenticated,
   audited reconciliation flow before enabling publishing; the present system
   deliberately offers no reset endpoint for reserved attempts.
5. Require creative review of the actual artwork and final mockup/photo, original
   or licensed content, accurate AI-use and production-partner disclosures where
   applicable, accurate product/variant details, supplier readiness, shipping,
   price and margin. Automated checks alone cannot certify rights or creativity.
6. Check duplicates against the shop as well as facility history. Never auto-renew,
   delete and recreate, favorite, purchase, review, or message people to fabricate
   engagement. No unsolicited customer messages.
7. Provide a reviewable action log with timestamps, approved-content fingerprints,
   outcomes and platform IDs, excluding credentials and unnecessary customer data.

No fake mouse movements, typing mistakes, browsing sessions, randomized identity
changes, CAPTCHA bypass, or other attempts to conceal automation. Pacing reduces
load; authorized access and content quality determine whether the workflow is
acceptable.

## Primary references checked October 30, 2026

- [Etsy API registration and approved automation](https://help.etsy.com/hc/en-us/articles/360025870013-How-to-Use-Etsy-s-API)
- [Etsy API terms](https://www.etsy.com/legal/api/)
- [Etsy request rate limits and Retry-After](https://developers.etsy.com/documentation/essentials/rate-limits/)
- [Current research boundaries](RESEARCH-ACCESS.md)
