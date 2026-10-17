# ADR-006: Host-side icon resolution and webview CSP

Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: the `readme/image` request; plan item P2.9: script nonce and `font-src`)

## Context

The main-panel CSP allow-listed badge hosts; icons from private feeds were blocked (default icon
with console CSP errors) while the backend still spent HEAD requests probing them; the sidebar
CSP allowed no remote images at all.

The amendment of 2026-10-12 records the contract changes of plan item P1.1b and plan decisions D7 and
D13 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, §1).

## Decision

- Package icons are fetched **host-side** through `Transport` (auth, outbound policy, 256 KB size
  cap, content-type check, LRU + workspace cache) and delivered to webviews as `data:` URIs.
  Icons that fail resolve to `undefined` and the webview shows the bundled default icon.
- Webview CSP: `default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource};
  font-src ${cspSource}; script-src 'nonce-${nonce}'; connect-src 'none'`. The nonce is 16 bytes from
  `crypto.randomBytes`, base64-encoded and fresh for every render; `font-src` admits the bundled fonts
  and nothing remote; styles are set through the CSSOM (React's `style` prop), never as `<style>` or a
  `style` attribute in rendered HTML. README images are fetched lazily through the
  `readme/image` request (`{ url, sourceUrl? }` → `{ url, dataUri | null }`) with the same
  host-side fetch, auth, size cap and policy as icons; `dataUri: null` means the webview renders
  the image as a link (fetch in plan item P4.4, rewriter in P5.7).
- No remote origin allow-list lives in HTML.

## Consequences

- Icons from Nexus/ProGet/Artifactory/GitHub Packages work with credentials.
- Webviews never make network requests.
