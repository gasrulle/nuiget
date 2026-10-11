# ADR-001: Host-owned session state (`SessionStore`)

Status: accepted · Date: 2026-10-10

## Context

Project, source, prerelease and restore selections were persisted by three writers (main-panel
`saveSettings`, sidebar QuickPicks, activation migration) and reconciled with one-shot anti-echo
booleans. Auto-selected projects were not persisted; selections could diverge between surfaces.

## Decision

- `core/session/SessionStore` is the **only** writer of shared session state
  (`selectedProject`, `selectedSource`, `includePrerelease`, `restoreEnabled`).
- The host owns *committed* state. A webview may hold *pending presentation* (immediate toggle
  feedback) but never persists or commits shared state. Webviews send `session/set` intents and
  render from `session/changed` broadcasts carrying a monotonic `rev`; a snapshot with a lower
  `rev` than the last applied one is ignored.
- Intents are applied in order; related settings are normalized atomically (a project change
  validates the source; `ALL_PROJECTS` downgrades when ≤ 1 project exists; a missing project
  falls back to the first project). The normalized snapshot is the response to the intent.
- In-memory acceptance and broadcast are immediate; persistence (`workspaceState`) is awaited
  by `apply()` but a persistence failure is logged and does not roll back the in-memory state.
- Operation context (restore toggle, project) is captured at **submission**, never re-read when a
  queued operation finally runs.
- Every webview resolve/re-show requests a fresh snapshot (`session/get`); it never relies on
  having seen earlier broadcasts.
- Surface-local state (search text, expansion, scroll, layout) stays in the webview via
  `getState/setState`; the host only persists layout preferences (`layout/*`).

## Consequences

- No `skip*Ref` flags; echo is impossible because the originating surface renders from the same
  broadcast as the other surface.
- `reconcile(projects, sources)` runs whenever the project or source list changes.
