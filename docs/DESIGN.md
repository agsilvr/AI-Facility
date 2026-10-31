# Facility workspace, October 2026

The facility is a dark, legible command workspace with warm code-drawn rooms and crew sprites. Interface text uses readable system fonts; pixel lettering belongs to the map. All visual assets remain drawn in code and work without external fonts or image services. See `DARK-UX.md` for the current visual tokens and information architecture, and `reliability-2026-10-30/AUDIT.md` for implemented reliability controls and remaining gaps.

## Layout and interaction

- The map fills the available left workspace, including its height. It has a clear reset control, smooth pointer-anchored zoom, pinch gestures, keyboard panning, and an accessible guide.
- Shared Command, Treasury, and Security rooms branch from the production spine. The numbered route reads Research → Design → Quality Control → Publishing → Archive/Outbox. Customer Care has its own workstation. Reserved expansion grows from a separate spur.
- The right workspace has Command, Jobs, Lab, Crew, and System sections. There is one map. Selecting a person or room replaces the right pane with a dossier without covering the map.
- Dossiers show assigned/current model, model location, role-specific data access, workstation, status, and assignment. Code actors and file checks are labeled as code rather than as AI models.
- Work is searchable and filterable. Jobs disclose their history, stage sequence, exact review package, and technical diagnostics on demand. Stopped jobs show a recovery explanation first.
- Keyboard focus is visible. Tabs support arrow/Home/End keys; Option 1–5 changes sections. Escape closes the dossier. Owner dialogs trap focus and return it when dismissed. Reduced-motion preferences remove camera flight and transition effects.
- Narrow windows stack the map and workspace rather than compressing controls into unreadable columns. Viewport changes reframe a selected room.
- The Treasury displays reported AI usage and explicitly marks sales as unconnected. Completed work is never represented as earned revenue.

These choices apply [NN/G's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) to status, recovery and recognition; [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) to technical detail; and [WCAG 2.2 guidance](https://www.w3.org/TR/WCAG22/) to keyboard access, focus and target sizes. [Apple's feedback guidance](https://developer.apple.com/design/human-interface-guidelines/feedback) informed contextual, proportional feedback. This is not a claim of full accessibility conformance.

[StarNet](https://starnetos.com/) is a useful benchmark for visible agent activity and truthful telemetry. This iteration uses an original warmer direction and focuses on clear business workflow and approvals; it does not claim feature parity with every StarNet integration.

## One operator at a time

Claude is the normal operator; Codex can temporarily own writing through the official subscription CLI. Briefings use current ledger facts assembled by code. Each handover increments a persisted generation. Owner-requested switches require the existing owner session and compare the generation, so a stale browser cannot overwrite a later handover. Only the elected operator receives new writing assignments.

Every attempt has a separate run token. A handover, pause, or agent pause invalidates the outgoing claim. Late answers are discarded; reported usage is still accounted for. Stopped jobs and owner approvals are retained. Returning to Claude uses the same handover mechanism; there is no automatic ping-pong between providers.

A Claude failure transfers leadership once to Codex. Existing stopped tasks still require the owner's explicit retry. The official Codex reader was smoke-tested successfully. It uses an empty temporary workspace, an ephemeral session, no user config, disabled command execution/multi-agent/plugins/hooks/memory/web, no configured MCP servers, structured output, validation and auditing. Its implementation follows the official [non-interactive guide](https://learn.chatgpt.com/docs/non-interactive-mode) and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). No saved login is extracted or reused directly.

New QC and agent configurations restore authority from code. Saved jobs migrate by stage identity when the QC stage is inserted, preserving existing drafts and approvals.

## Evidence research notebooks

The Lab notebook runs one bounded local Qwen analysis of a changed usable evidence pack, with at least 24 hours between automatic starts, independently of the product approval backlog. An unchanged analyzed pack or expired source dates do not trigger another run. The result compares three product hypotheses with evidence references, next validation steps and limitations. It does not chain to Claude or publish anything. Saved tasks preserve the schedule across restarts. Unfinished or failed notebooks block new automatic runs; no missed-run backlog is replayed. The facility kill switch and Scout's pause still hold. Recent public report titles are untrusted data, never permission.

The public pack contains nine dated observations with separate buyer and supplier roles, saved in `src/core/research.ts`. Qwen proposes concepts and citations; code supplies factual evidence, limitations and validation steps. It does not independently browse. Supplier variant costs, shipping, exact-product demand and margins still need verification. Future retrieval must remain a controlled read-only component rather than giving drafting models arbitrary tools.

## Boundaries

Image generation uses an official chat handoff; unattended generation, supplier-specific product checks, publishing and accounting connections remain incomplete. File checks inspect SVG dimensions or PNG integrity, alpha and visible bounds. They do not certify creative or supplier readiness. The complete design review and exact owner approval remain separate requirements.

## Shared work synchronization update

External official-app/chat work now has persisted operation claims in the same ledger. The map's studio and other workstations, room status strip, Command counters, searchable Jobs, crew dossier and context/history cards all derive from those claims. Claims reserve a workstation, expire after a lost heartbeat, survive restart as interrupted handoffs, and reject a previous worker's result after reassignment. Completed phases leave visible receipts; paused and blocked work are distinguished from idle work. Offline views stop presenting saved activity as live.

`docs/FACILITY-WORK.md` defines the required reporting protocol for Codex and Claude. The bridge cannot automatically see an unconnected AI session. A separate DeepSeek app is not a verified facility reader. Current design checks and saved owner feedback are in `docs/DESIGN-QUALITY.md`. The design prompt does not assume all products are opaque wall posters.
