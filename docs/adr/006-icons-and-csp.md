# ADR-006: Host-side icon resolution and webview CSP

Status: accepted · Date: 2026-10-10

## Context

The main-panel CSP allow-listed badge hosts; icons from private feeds were blocked (default icon
with console CSP errors) while the backend still spent HEAD requests probing them; the sidebar
CSP allowed no remote images at all.

## Decision

- Package icons are fetched **host-side** through `Transport` (auth, outbound policy, 256 KB size
  cap, content-type check, LRU + workspace cache) and delivered to webviews as `data:` URIs.
  Icons that fail resolve to `undefined` and the webview shows the bundled default icon.
- Webview CSP: `default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource};
  script-src ${cspSource}; connect-src 'none'`. README images are rewritten through the same
  host-side fetch (`readme/image` lazily) or shown as links when the fetch fails.
- No remote origin allow-list lives in HTML.

## Consequences

- Icons from Nexus/ProGet/Artifactory/GitHub Packages work with credentials.
- Webviews never make network requests.
