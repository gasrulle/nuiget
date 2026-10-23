# Architecture Decision Records

Decisions for the nUIget 2.0 re-architecture and the UX overhaul that follows it. Each record is written **before or
with** the first implementation of its subject and updated when the decision changes. Status values: `proposed`,
`accepted`, `superseded by ADR-nnn`.

| ADR | Title | Status |
|-----|-------|--------|
| [000](000-release-and-compatibility-policy.md) | Release and compatibility policy | accepted |
| [001](001-session-store.md) | Host-owned session state (`SessionStore`) | accepted |
| [002](002-query-coordinator.md) | Resource queries, generations and invalidation (`QueryCoordinator`) | accepted |
| [003](003-operation-queue-and-dotnet-runner.md) | Operation queue outcomes and shell-free CLI execution | accepted |
| [004](004-project-model.md) | Three-tier project model (inspect / evaluate / mutate) and CPM | accepted |
| [005](005-execution-context-and-outbound-policy.md) | Project execution context and outbound request policy | accepted |
| [006](006-icons-and-csp.md) | Host-side icon resolution and webview CSP | accepted |
| [007](007-protocol.md) | Typed envelope protocol for webview ↔ host | accepted |
| [008](008-webview-architecture.md) | Webview architecture: shared slices, primitives, two entry points | accepted |
| [009](009-catalog.md) | Catalog: the use-case layer over the query coordinator | accepted |
| [010](010-no-layering.md) | No layering: a rebuild or refactor replaces rules, never overrides them | accepted |
| [011](011-look-and-tokens.md) | Follow the host's look; size tokens alias VS Code's exported tokens (amends ADR-000 and ADR-008) | accepted |
| [012](012-icon-delivery.md) | Icons are inline SVG generated from a pinned codicon release | accepted |
| [013](013-keyboard-and-menus.md) | Keyboard and menus: Enter never writes; one native actions menu on both surfaces | accepted |

ADR-010 to ADR-013 record the decisions of the UX overhaul, drawn from the research report
(`docs/research/2026-10-23-ux-research.md`) and the design decisions (`docs/design/DECISIONS.md`). They stayed
`proposed` until the owner approved the UX execution plan on 2026-10-23. ADR-000 will carry an "Amended: 2026-… (ADR-011: engines
^1.90.0)" header line, written by the UX plan's P0 floor item under the sentinel. The planning session wrote ADR-010
to ADR-013 under the `.claude/.contract-change` sentinel (the 2.0 plan's decision D6, which the UX plan keeps):
sentinel created, files written with the Write tool, sentinel deleted, then committed. Any later change to a record here follows the same procedure inside a plan item that names it.

Supplements (evidence for a record, not separate decisions):

- [004-sdk-probes.md](004-sdk-probes.md): measured `dotnet package add/remove` behaviour on Central Package
  Management projects, backing the `cpmAwareAdd` capability in ADR-004.
- [005-proxy-matrix.md](005-proxy-matrix.md): how the VS Code extension host treats an extension's `https` and
  `http2` requests per proxy and certificate setting, backing the `Transport` bullet of ADR-005 and the decision
  not to vendor a proxy agent.
