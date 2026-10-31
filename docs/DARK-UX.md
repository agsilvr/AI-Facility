# Dark workspace redesign — October 30, 2026

The owner’s complaint was structural: too many competing labels, overlapping map
controls and selected details stacked above an already busy page. A darker palette
alone would leave those problems intact.

## Reference and research decisions

StarNet OS is the benchmark selected for this iteration. Its
[documentation](https://starnetos.com/docs/) and
[station interface](https://starnetos.com/app/embed.htm?v=20260905-current-station-v4)
use short operational navigation, clear station/crew/system vocabulary, and explicit
recovery instructions. Facility adopts that approach with **Command, Jobs, Lab,
Crew, System**. It does not claim StarNet capabilities that Facility has not built.
No StarNet code, fonts, packages or assets were copied.

| Evidence                                                                                                                                                                                   | Decision in Facility                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [NN/g: complex application design](https://www.nngroup.com/articles/complex-application-design/) — keep important information salient and supporting detail secondary                      | One workspace pane; selected jobs, agents and rooms replace the current page. No stacked inspector above the roster.                                                                       |
| [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)                                                                                                   | Workflow history, saved notes, diagnostics, permissions, research evidence and handover explanations open on demand. Exact approval content and blocking findings stay visible.            |
| [NN/g: recognition rather than recall](https://www.nngroup.com/articles/recognition-and-recall/)                                                                                           | Persistent named navigation, visible category choices with counts, room locator, labelled Back actions, actual assigned models.                                                            |
| [GOV.UK: error messages](https://design-system.service.gov.uk/components/error-message/) — explain the problem and the recovery                                                            | Separate Login needed from credit limits, unavailable connections and other blockers. Recovery text reflects the current operator. Retrying a failed writing step names the elected model. |
| [Apple: dark interface evaluation](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/dark-interface-evaluation-criteria)                                         | Semantic charcoal surfaces, readable secondary text, restrained accent, distinct warnings, contrast checked numerically. Avoid low contrast gray labels on black.                          |
| [W3C: accessibility principles](https://www.w3.org/WAI/fundamentals/accessibility-principles/) and [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast) | Named controls, visible focus, keyboard tab navigation, text status, reflow, reduced motion support, and room/crew alternatives to canvas interaction.                                     |

## Information architecture

- **Command:** elected operator, running/review/blocked counts, actionable attention
  summary, recent jobs, latest notebook. Operator handover is secondary.
- **Jobs:** search and category selector. All groups jobs by next action: Approval,
  Login needed, Blocked, In progress, Waiting, Done. Empty categories remain in the
  selector with zero counts. Search is combined with the selected category.
- **Job detail:** one selected job, exact review content, findings and approval or
  retry actions. Expired or blocked packages remain unapprovable. Back retains the
  search and filter, and returns focus to the job row.
- **Lab:** local Qwen research action and latest notebook. Directions expand to
  evidence and next steps. Saved-source limitations are explicit. Research cadence
  waits for changed usable evidence and has a minimum 24-hour automatic interval.
- **Crew:** compact roster; selected agent shows its actual current/assigned model,
  location, status and assignment. Permissions are secondary.
- **System:** Connections, Usage and Activity. Idle subscriptions say sign-in
  unverified; a local Qwen readiness probe is distinct from a live assignment.
  Unbuilt integrations remain labelled and offline snapshots show no live workers.

The map owns the left area. Its toolbar, help and status are in normal layout flow;
none covers rooms or approval actions. Smooth anchored zoom is preserved. At widths
up to 1024 px, the map and workspace stack so the facility does not become a sliver.
A compact header and controls wrap at phone widths.

## Visual and interaction checks

Local fonts and code-drawn art only. No added runtime dependency. Charcoal UI with
warm rooms, quiet terrain, mint actions and amber recovery. Flat rows replace nested
cards and the previous large introductory copy.

Measured contrast against the main panel `#171d25`:

- Main text `#e6edf3`: **14.35:1**.
- Secondary text `#a2b0be`: **7.66:1**.
- Accent text/focus `#8dd7c0`: **10.18:1**.
- Primary button text `#10271f` on `#8dd7c0`: **9.47:1**.
- Warning text `#efc383` on `#453725`: **7.01:1**.
- Neutral badge text `#c0cbd6` on `#28323e`: **7.89:1**.

These measurements cover UI tokens, not a claim of a complete accessibility audit.
Pixel art remains decorative context for the equivalent room locator and crew list.
Automated regressions cover category classification, operator-aware recovery, actual
model display, exclusive detail panes, and blocked/expired approval protection.
Desktop and narrow Safari views are checked with the running app before launch.
