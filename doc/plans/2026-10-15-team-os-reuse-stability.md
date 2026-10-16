# Team OS reuse: execution and review stability

Date: 2026-10-15. Baseline: 4a641d0980fdaffc4c4e805f6f0a8809eb5702f2.

Reuse Paperclip as the only task/run source. Keep the Chinese discussion-group product in a thin integration layer. Do not replace the scheduler or database.

Current local qualification uses an isolated local_trusted instance with native runner experiments disabled and codex_local ACP / oneshot. Qualify three serial real file deliveries, retry deduplication, clean cancellation, timeout, and restart separately. Local test scripts are outside the source checkout; their results are not production guarantees.

## Narrow UI repair

Selecting Done on an in-review execution stage currently sends a status-only PATCH. The backend correctly refuses it because the decision comment must accompany the same request. Collect that comment in a dialog before sending the existing update. Keep backend actor checks and approval gates unchanged. Do not synthesize an opinion, reuse an unrelated old comment, or issue an optimistic status change before submission.

Use the same handler for the task header and desktop/mobile properties. Retain the draft on errors, allow cancellation without mutation, and check that the stage has not changed before submitting. This is a small compatibility patch, not the final Team OS interface.

Validation: focused policy/dialog tests, existing IssueDetail regressions as relevant, UI typecheck and token gate, then real browser review with a comment and an API read of the persisted decision. Full monorepo release qualification is separate.

## Qualification result

The focused UI tests, typecheck, token gate, and browser review passed. The browser submitted an explicit decision comment, and the API returned an approved decision with the stage completed and the issue done.

Three serial ACP file tasks also completed with succeeded runs, exit code zero, one attachment and one work product each, and attachment bytes matching the workspace files. A clean board Stop cancelled one run, terminated its parent and child processes, and produced no successor run during observation.

A graceful SIGTERM during another active run produced an interrupted source run and a linked automatic retry after restart. Stopping that recovered retry exposed a bounded upstream gap: the Stop request returned `adapter_stop_pending`; the provider later cancelled and the process tree exited, but `executionCancellation.state` remained `requested` and the issue stayed `in_progress` with no recovery action. Team OS must derive its user-facing state from the issue, latest run, live execution, and cancellation acknowledgement together. It must show this case as stopped with confirmation incomplete, never as working or successful. Power-loss recovery and unavailable-authentication UX remain unqualified.

## M1 first product slice

The reuse layer now exposes a company-scoped `/workspace` route and a Chinese `工作台` navigation entry. Desktop presents tasks, execution/attempts, and artifacts in three columns. Narrow screens use explicit `任务 / 执行 / 成果` tabs so a selected task does not disappear below a stacked layout.

The page reads existing issue, heartbeat-run, agent, and artifact APIs. It does not create a second task store. Its product-state projection is deliberately stricter than the issue status alone: an `in_progress` task whose latest run is cancelled while cancellation acknowledgement is missing or still `requested` is shown as `已停止，确认未闭环`. A real browser check also confirmed that a completed file task maps to its single artifact card.

The workbench now supports direct agent replies, verified run Stop, and explicit accept/rework decisions. These actions reuse the existing issue comments, heartbeat cancellation acknowledgement, and execution-policy transition paths. A rework request changes `in_review` back to `in_progress` with the user's comment, allowing the backend to hand the task back to the original executor while old runs and artifacts remain intact. The UI re-reads the issue and checks the review-stage identity before either decision so a stale screen cannot approve or rework a changed stage.

Artifact cards now open a workbench preview dialog. Images and video use the authenticated attachment content route. Markdown renders with remote media and links inert. HTML is fetched only from a strict `/api/attachments/:id/content` path, capped at 2 MB, then inserted into a `sandbox="allow-scripts"` iframe without `allow-same-origin`. The injected CSP blocks network connections, forms, child frames, and base navigation. A real HTML counter ran from 0 to 1 in the browser; the iframe reported opaque `origin: null`, `no-referrer`, and the restrictive CSP.

The artifact projection now carries its trustworthy producing Run for work products and direct attachments. The workbench maps that Run to `尝试 N` and preserves the retry marker; sources without reliable run evidence show `尝试未归属` instead of inventing a version. The real `round3-counter.html` card was linked to `尝试 1` after the backend restart.

Focused projection, decision-dialog, preview-policy, artifact-card, and server artifact-service tests, UI typecheck, token gates, and browser checks passed. The workbench now reloads the selected issue detail for review-stage decisions, resets only the task-scoped agent session when recovering a blocked task, and can submit an already-produced `ready_for_review` artifact without discarding it. Attempt labels use the task's chronological run history, so a restarted recovery chain cannot reset the visible numbering.

A live TEA-11 browser round completed version 1 delivery, explicit rework, version 2 delivery, and acceptance. Both HTML artifacts remained visible and were attributed to attempts 7 and 8; the second preview showed the requested blue title and its counter advanced from 0 to 1. TEA-12 then verified a 320 by 180 PNG preview and Markdown headings, lists, emphasis, inline code, and blockquotes. The Markdown preview produced no external anchor and loaded no remote image for the embedded external references.

The workbench now also creates or selects a project, selects an Agent, and creates the assigned task through the existing project and issue APIs. Stable idempotency keys cover retries across the combined flow. TEA-13 verified the full browser path: create a project and task in the Chinese workbench, let Codex produce a Markdown artifact, preview the exact heading and list content, and accept it with a review comment. The issue finished as `done` without using the original management page or a terminal in the user flow. The artifact projection also deduplicates two Work Products that reference the same immutable attachment while retaining trustworthy Run attribution.

M1 is qualified on the isolated local instance. TEA-14 confirmed that browser Stop ends the parent and child processes while the workbench distinguishes a completed cancellation from incomplete acknowledgement. TEA-15 showed a real adapter timeout and preserved the timeout attempt before a retry. TEA-17 showed a missing ACP command as an explicit abnormal state and recovered through the workbench after the command was restored. TEA-18 hard-killed the server during an active run: startup recovery terminalized the orphan as `interrupted`, the original process tree exited, stored artifacts survived, and the workbench required a fresh user instruction before creating a second attempt. On the narrow layout, a user opened TEA-13, switched to `成果`, and opened `m1-final-check.md` in three clicks with task, attempt, and Agent attribution visible.

One upstream boundary remains: an `agent_key` run that assigns its issue to the human reviewer is intentionally outside the existing `agent_jwt` self-handoff exception, so that run can be cancelled before the issue transition commits. The workbench preserves the artifact and provides a recovery path, but this does not qualify the server behavior as fixed. It is recorded as an upstream maintenance boundary rather than an M1 blocker.
