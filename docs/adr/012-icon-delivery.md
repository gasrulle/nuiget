# ADR-012: Icons are inline SVG generated from a pinned codicon release

Status: accepted · Date: 2026-10-23

## Context

`src/webview/shared/primitives/icons.tsx` holds 26 icon components: 23 named after codicons, the Verified mark (a
14 px check in the link colour, drawn to match nuget.org) and two custom glyphs (`SingleProjectIcon`,
`AllProjectsIcon`). The research of 2026-10-23 (`docs/research/2026-10-23-ux-research.md`, §6; findings H22, H70) found:

- Of the 23 codicon icons, 18 differ from every current codicon drawing: some are pre-redraw paths, some are hand
  variants that match no release. The codicons were redrawn on 2025-10-07 and again on 2026-02-02, and the redraw
  enters VS Code at 1.106. A host at the 1.90 floor (ADR-011) draws the old glyphs and a 1.142 host the new ones, so
  no single release matches every host. A webview cannot use the workbench's own icon font: VS Code does not export
  it.
- The Extensions view draws the Verified mark as the `verified-filled` codicon in `extensionIcon.verifiedForeground`.
- The file's header says the paths are MIT. The codicons repository licenses its drawings under CC-BY-4.0 and only its
  code under MIT; the VSIX carries no attribution today. Not checked with counsel.
- Every icon is a `/* @__PURE__ */ React.memo(…)` call so that a bundle keeps only the icons it uses
  (`webview-icons-pure.test.ts` pins this and the count, finding N63). An icon renders no `style` (ADR-006).
- Regenerating the 23 icons from the current drawings costs +6,203 bytes in the panel bundle and +2,834 in the
  sidebar bundle (measured), against 26,372 and 17,332 bytes of headroom at `e4d6e97`. One new drawing
  (`settings-gear`) uses a 24-unit viewBox, so the viewBox must come from each SVG.
- The Content Security Policy admits bundled fonts (`font-src ${cspSource}`, ADR-006), but the build does not ship
  one: esbuild has no font loader configured, `dist/*.ttf` is outside the VSIX allow-list of
  `scripts/check-vsix-contents.mjs`, and `data:` fonts are refused by the policy.

## Decision

1. **Generated, not drawn.** A script, `node scripts/sync-codicons.mjs`, writes the icon module from a pinned release
   of `@vscode/codicons` (an exact-version devDependency). Each component carries the SVG's own `viewBox` and path
   data verbatim. The list of icons the product uses is the script's input; the Design System's icon plan owns it,
   and the count pinned by `webview-icons-pure.test.ts` follows that list.
2. **A lint holds it.** A Vitest lint in `src/test/lint/` compares every generated icon's name, viewBox and path data
   with the pinned release's SVG. A hand-edited path, an unknown name or a drift from the release fails.
3. **No hand-drawn glyph remains.** The two custom glyphs map to codicons the icon plan names; the Verified mark is
   `verified-filled`, coloured with the `extensionIcon.verifiedForeground` role (ADR-011), at a codicon size.
4. **The shape stays.** Every icon remains a `/* @__PURE__ */ React.memo(…)` component taking `size`, `className` and
   `title`, rendering no `style`, hidden from assistive technology without a title and an image with that name with
   one. Glyphs are 16 px in rows, toolbars and headers and 12 px inline, the two codicon sizes; their colour is the
   `icon.foreground` role unless a state colours them.
5. **One release for every host.** The pinned release is the newest at the time of the icon item, so the glyphs match
   hosts from 1.106 on; hosts from 1.90 to 1.105 see the reverse mismatch, which is accepted. A release bump is its
   own item: re-run the script, re-run the lint, re-capture the states that show icons. Dependabot does not move the
   pin on its own.
6. **Attribution.** `LICENSE` gains a third-party notice for the codicon drawings (CC-BY-4.0, with the source and the
   release), the README credits them, and the generated module's header states both licences correctly (code MIT,
   drawings CC-BY-4.0). These are the only files the VSIX ships that can carry it.

**Alternative recorded: the codicon font**, the workbench's own mechanism. Ship `codicon.ttf` (149,508 bytes) and
`codicon.css` (38,876 bytes) of the same release and draw glyphs as `::before` content. The CSP admits it unchanged.
Not chosen, because:

- the build and the VSIX allow-list do not admit it today: a font under `dist/` needs a loader and an allow-list
  entry; a font under `resources/` passes the allow-list and could be loaded with the `FontFace` API from a URI the host
  hands over in `renderWebviewHtml`'s dataset, but that route was never exercised in a live webview at the floor;
- the whole font ships whatever the bundle uses (about 188 kB in the VSIX) where inline SVG keeps only the glyphs a
  bundle imports;
- it adds a second icon path and class names without the `nuiget-` prefix, which the class-prefix lint of
  `webview-stylesheets.test.ts` refuses wherever a repository stylesheet targets them;
- axe's handling of private-use `::before` glyphs was not verified by a run.

If a later need (hundreds of glyphs, host-matched icons) outweighs these costs, this record is superseded, with the
font route proven in a live webview at the floor first.

## Consequences

- One item of about one session-day: the script, the lint, the regenerated module, the mapped custom glyphs, the
  Verified mark, the attribution, and the captures that show icons re-approved.
- Bundle sizes grow by the measured delta, inside both ceilings; any further icon is paid per bundle that uses it.
- `package.json` gains the pinned devDependency; the Dependabot policy item adds it to the ignore list so that a bump
  is always the item of Decision 5.
- The comment in `icons.tsx` that codicon fonts are not available in webviews is wrong and goes with the regenerated
  header.
- ARCHITECTURE.md's icon paragraph describes the generator and the lint.
