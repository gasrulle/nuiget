# Architecture Decision Records

Decisions for the nUIget 2.0 re-architecture. Each record is written **before or with** the first
implementation of its subject and updated when the decision changes. Status values: `proposed`,
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
