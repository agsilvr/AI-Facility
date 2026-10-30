# Facility workspace, October 2026

The facility is a warm, legible command workspace with an original cottage-game influence: timber, muted greens, paper, stone, small crew sprites, and pools of warm light. Interface text uses readable system fonts; pixel lettering belongs to the map. All visual assets remain drawn in code and work without external fonts or image services.

## Layout and interaction

- The map fills the available left workspace, including its height. It has a clear reset control, smooth pointer-anchored zoom, pinch gestures, keyboard panning, and an accessible guide.
- Shared Command, Treasury, and Security rooms branch from the production spine. The numbered route reads Research → Design → Quality Control → Publishing → Archive/Outbox. Customer Care has its own workstation. Reserved expansion grows from a separate spur.
- The right workspace has Command, Work, Research, Crew, and Activity sections. There is one map. Selecting a person or room reveals an inline dossier without covering the map.
- Dossiers show assigned/current model, model location, role-specific data access, workstation, status, and assignment. Code actors and file checks are labeled as code rather than as AI models.
- Work is searchable and filterable. Jobs disclose their history, stage sequence, exact review package, and technical diagnostics on demand. Stopped jobs show a recovery explanation first.
- Keyboard focus is visible. Tabs support arrow/Home/End keys; Option 1–5 changes sections. Escape closes the dossier. Owner dialogs trap focus and return it when dismissed. Reduced-motion preferences remove camera flight and transition effects.
- Narrow windows stack the map and workspace rather than compressing controls into unreadable columns. Viewport changes reframe a selected room.
- The Treasury displays reported AI usage and explicitly marks sales as unconnected. Completed work is never represented as earned revenue.

These choices apply [NN/G's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) to status, recovery and recognition; [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) to technical detail; and [WCAG 2.2 guidance](https://www.w3.org/TR/WCAG22/) to keyboard access, focus and target sizes. [Apple's feedback guidance](https://developer.apple.com/design/human-interface-guidelines/feedback) informed contextual, proportional feedback. This is not a claim of full accessibility conformance.

[StarNet](https://starnetos.com/) is a useful benchmark for visible agent activity and truthful telemetry. This iteration uses an original warmer direction and focuses on clear business workflow and approvals; it does not claim feature parity with every StarNet integration.

## One operator at a time

Claude is the normal operator; Codex can temporarily own writing and briefings through the official subscription CLI. Each handover increments a persisted generation. Owner-requested switches require the existing owner session and compare the generation, so a stale browser cannot overwrite a later handover. Only the elected operator receives new writing assignments.

Every attempt has a separate run token. A handover, pause, or agent pause invalidates the outgoing claim. Late answers are discarded; reported usage is still accounted for. Stopped jobs and owner approvals are retained. Returning to Claude uses the same handover mechanism; there is no automatic ping-pong between providers.

A Claude failure transfers leadership once to Codex. Existing stopped tasks still require the owner's explicit retry. The official Codex reader was smoke-tested successfully. It uses an empty temporary workspace, an ephemeral session, no user config, disabled command execution/multi-agent/plugins/hooks/memory/web, no configured MCP servers, structured output, validation and auditing. Its implementation follows the official [non-interactive guide](https://learn.chatgpt.com/docs/non-interactive-mode) and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). No saved login is extracted or reused directly.

New QC and agent configurations restore authority from code. Saved jobs migrate by stage identity when the QC stage is inserted, preserving existing drafts and approvals.

## Research test

The Research notebook can run one bounded local Qwen job against two dated public sources. The result is a saved report with three opportunities, evidence references, next validation steps and limitations. It is a standalone workflow: it does not chain to Claude or publish anything. Repeated requests reuse an unfinished test rather than creating duplicate jobs.

The public evidence pack contains [Etsy's Fall/Winter 2026 report](https://www.etsy.com/seller-handbook/article/1521255894814) and [Printify's general poster information](https://printify.com/custom-posters/), checked October 30. Qwen analyzes these saved notes; it does not independently browse. Competitor prices, supplier variant costs, shipping and margins still need verification. Future retrieval should remain a controlled, read-only component rather than giving drafting models arbitrary tools.

## Boundaries

Image-generation handoff, supplier-specific print checks, real publishing, and accounting connections remain future work and are labeled accordingly. QC currently verifies the saved artwork file's existence and expected SVG format/dimensions; it is not a creative or supplier-readiness certification. Your creative approval remains required before outward actions.
