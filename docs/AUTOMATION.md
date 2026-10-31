# Current operating status — reliability repair, 30 October 2026

The owner confirmed **$10,000/month profit after costs** as the target. Measured profit is unknown. Production remains paused; the existing unpublished Printify draft is retained. The current implemented behavior and remaining integration work are recorded in [the audit](reliability-2026-10-30/AUDIT.md) and [the operating plan](reliability-2026-10-30/OPERATING-PLAN.md).

Current differences from the earlier plan below: factual briefings use code; models cannot invent prices; new products require a current validated evidence notebook; automatic research does not repeat an unchanged pack; automatic product creation defaults off unless explicitly enabled; PNG transparency/bounds are inspected; and artwork revisions are bounded to three attempts. Manual image generation, supplier checks, publishing and accounting remain incomplete integrations. Historical feature descriptions below do not override these controls.

---

# Automatic product operation

Owner direction, October 30, 2026: the facility chooses product ideas and runs the
whole pipeline automatically. Asking the owner to pick each idea or operate each
stage is not the target workflow. Tell the owner when account linking is needed,
once the relevant connection is ready to configure and verify.

Target flow:

`Research → select product → generate artwork → check/revise → prepare product and mockups → price and write listing → publish → reconcile and archive`

The owner sets the shop's creative direction and operating limits. Routine choices
belong to the facility. Exceptions, missing authorization, ambiguous external writes,
and unresolved platform requirements need attention. Never treat model text as
permission or pretend an unavailable connection succeeded.

## Installed research-to-artwork pilot

The owner refined the immediate goal: move without Claude, prove research to design,
and keep human quality review before enabling full automation. DeepSeek is not needed
for this pilot. Codex remains the elected operator; Qwen supplies local research.

Lab now starts a separate `artwork-pilot` workflow, independently of the three stopped
listing jobs. It selects a direction, saves a creative brief, waits for the Codex
image-generation handoff, checks the received PNG, and presents that exact image for
owner review. PNGs are stored by full SHA-256 and checked for bounded decompression,
chunk integrity, dimensions and matching fingerprints. Approval binds the image,
prompt, resolution and revision. Accepting archives it locally; it has no publishing
stage. Rejecting returns to a fresh handoff with the owner's revision notes while
retaining previous files. Stale handoffs cannot replace a later image.

The generator is the official image tool in the Codex chat. The server does not yet
invoke it unattended. `scripts/attach-artwork.py` returns the explicitly selected PNG
to its saved request through the local API; it cannot approve or publish. The app
labels native resolution and concept status, rather than certifying print readiness.
The existing PIN remains required for acceptance, revision decisions and retries.

## Automatic selection

Product research receives the latest usable completed notebook from the same wing.
Qwen chooses an eligible direction automatically, with a required explanation.
Code validates the candidate identity and retains its notebook ID, source IDs,
limitations and selection reason in the product brief. The listing writer receives
that record as untrusted background. Notebook warnings carry into product review.
Directions already claimed by saved products are excluded. When the current notebook
is exhausted, automatic product creation waits for new research. The saved product
creation clock prevents a restart from immediately creating another product.

Without a usable notebook, new product creation waits. A current notebook still establishes only a product hypothesis, not verified demand.
Current notebook evidence does not establish competitor pricing, supplier costs,
shipping or margins. No owner idea-selection step is introduced.

The older listing workflow continues to make type-only SVGs and waits at its existing
final approval gate. Its stopped jobs are preserved. Use the artwork pilot to inspect
actual generated illustrations before extending that listing workflow.

## Remaining work before automatic publication

1. Connect and verify unattended artwork generation through an officially supported
   subscription path. Interactive image generation and scripted text execution are
   documented separately; do not infer that one establishes unattended image support.
   No paid image API or extracted subscription token is authorized by this plan.
2. Resolve supplier products and variants, actual costs, shipping and fees; enforce
   explicit price and margin limits. A model's price guess is not a cost record.
3. Export the selected product's actual print file and mockup, validate that exact
   version, and implement bounded revision handling. Current SVG checks do not
   establish supplier readiness, rights, creativity or visual quality.
4. Replace the per-item publishing approval design with an explicit, persisted owner
   operating policy where platform requirements allow it. The owner has requested
   full automation; this is the intended product change, not a request for repeated
   approval. Bind eligibility to exact assets, product, price and policy version.
   Preserve stop controls, audit records, budgets and publishing limits.
5. Implement authorized publishing connectors, request-limit handling, durable intent,
   external IDs and reconciliation of interrupted calls. Account linking alone does
   not implement these behaviors. Existing three-attempt/four-hour rules remain.
6. Verify the complete flow against the connected shop before enabling routine writes.

## Account-linking checkpoints

- **Printify:** request connection when product, variant, artwork-upload and mockup
  integration is ready to verify. First use read-only catalog/cost checks; activate
  writes only after the exact product package and reconciliation are implemented.
- **Etsy:** request seller-app authorization when the shop connector and consent flow
  are ready. Explain the requested scopes and use Etsy-approved access. The live
  facility currently has no functioning Etsy publishing connection.
- **Model accounts:** existing official app sign-ins remain the intended path. Request
  reauthentication only when an actual connection test shows it is needed. Do not
  ask for passwords, cookies, login-token files or secrets in chat.

## Documentation checked

- [Etsy creativity standards](https://www.etsy.com/legal/creativity/): seller-original
  designs, seller-prompted AI creations, AI disclosure and production-partner details.
  This page does not specify a universal per-listing approval-button requirement;
  the current button is an application control. Seller creative participation still
  needs to be addressed before claiming an autonomous shop complies.
- [Etsy API access](https://help.etsy.com/hc/en-us/articles/360025870013-How-to-Use-Etsy-s-API).
- [Official OpenAI image generation documentation](https://learn.chatgpt.com/docs/image-generation).
- [Official OpenAI non-interactive execution documentation](https://learn.chatgpt.com/docs/non-interactive-mode).
