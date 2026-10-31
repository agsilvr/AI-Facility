# Research access, checked October 30, 2026

The objective is useful research without unauthorized Etsy activity. No system can
guarantee that Etsy will never flag a shop. Random pauses do not establish permission
or provide that guarantee.

## Running now

- Scout runs Qwen on this Mac. The reader offers no browser, terminal, network tools,
  cookies, Etsy login or platform actions. Application requests go only to
  `127.0.0.1:11434`, and HTTP redirects are rejected, including readiness checks.
  This is an application boundary, not an operating-system firewall for the Mac.
- A standalone notebook is scheduled every 24 hours, independent of pending product
  approvals. Saved tasks prevent duplicate scheduling across restarts. Unfinished or
  failed notebooks block further automatic runs; pauses and budgets still apply.
- Inputs are saved, dated public evidence and recent public idea titles. They are
  fenced as untrusted data. Output must match a schema, cite known evidence, and is
  saved with an explicit statement that no live Etsy data was collected.
- Research does not publish, send messages, change the shop or collect marketplace
  pages. Publishing remains unconnected. Each model call is audited.

## What StarNet contributes

[StarNet's capability model](https://starnetos.com/docs/station) makes access an
explicit grant. Its [autonomy controls](https://starnetos.com/docs/autonomy) bound
unattended work and retain real run records. Facility follows the same useful design
principles with code-owned roles, saved schedules, visible results and a kill switch.
These are architectural references, not evidence of Etsy approval or undetectability.
No StarNet code, plugins, skills or browser packages were installed.

## Bringing in fresh market evidence

[Etsy's API terms, section 5](https://www.etsy.com/legal/api/), items 24 and 25,
require express written authorization for the specified automated access/analysis
and collection for analytics uses. API credentials or low request volume alone do
not establish permission for marketplace research. Obtain authorization covering the
specific proposed use before enabling an Etsy data collector.

Etsy's [Marketplace Insights](https://help.etsy.com/hc/en-us/articles/35122361353239-How-Do-I-Use-Etsy-s-Marketplace-Insights-Tool)
provides seller-facing search and listing counts. Use that tool directly for current
validation within its available limits. It is not a grant to automate its browser
interface or feed its data into an unrestricted automated pipeline.

Until an authorized collection source is connected, daily reports remain analysis
of saved evidence, not fresh competitor monitoring. Independent public or licensed
sources can be evaluated separately for their permitted uses.

If an approved collector is added later, its code should restrict hosts and
operations, collect only necessary fields, follow the authorized retention policy,
cache permitted results, enforce request budgets and rate limits, and stop on
authentication failures, access denials, rate limits or bot challenges. Jitter may
spread allowed requests to avoid bursts; it must not be presented as a way to hide
unauthorized activity. Research readers retain no browser or account access.
