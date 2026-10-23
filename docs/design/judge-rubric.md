# Design judge rubric

The rubric the `design-judge` workflow (`.claude/workflows/design-judge.js`) scores captures against. Three judges,
each with one lens, read it with the capture, the committed artboard and the state's `spec.json`; one refuter per
state re-crops every box. **No plan item edits this file.** It changes only through a planning decision recorded in
`docs/design/DECISIONS.md`, and after any change the judge's two-tree negative control runs again before its findings
gate anything.

The judge is a second opinion, not the gate of record. The measurements in `src/test/ui/v2/measure.ts`, the lint gate
and axe are the gates; vision models localise approximately and miss offsets of a few pixels (research report §5,
rank 10). The judge exists for what a script cannot state ("does this read as a built-in view", "looks squeezed")
and to find candidate rules. Every standing finding still gets a disposition (§9).

## 1. What a judge gets, and what it never reads

| Input | Path | Notes |
|---|---|---|
| Capture | `captures/<run-id>/<state>.<theme>.<width>.png` | A CI capture cropped to the webview iframe, DPR 1; for the listing, the rendered README page |
| Artboard | `docs/design/artboards/<state>.<theme>.<width>.png` | Same viewport and coordinate system as the capture |
| Redline | `docs/design/artboards/<state>.spec.json` | Test id → expected rectangle, inset, gap, height and token names; its declared exceptions |
| Rules | `docs/design/design-system.md` | Cite rule ids (`DS-<AREA>-<n>`) from here |
| This rubric | `docs/design/judge-rubric.md` | Severity, boxes, lenses, what is not a finding |

A judge never opens `docs/plans/**` (the plan, `STATUS-ux.md`, the judge logs), any `STATUS.md`, commit messages or
`git` history. It judges what is on the pixels against the artboard, the redline and the rules, not what the item
claims to have done.

## 2. Boxes and coordinates

- A box is `[x, y, w, h]`, integers, in CSS px of the capture as given, origin at the top-left corner of the PNG. The
  harness crops every capture to the webview iframe rect, so the origin is the webview's top-left corner.
- A CI capture is DPR 1: PNG px are CSS px. A PNG twice as wide as the spec's viewport is DPR 2 (a local macOS run):
  halve every pixel position before reporting. A DPR 2 capture never decides a golden or a gate.
- The artboard PNG uses the same viewport and origin, so a box names the same place in both images.
- Make the box tight: the smallest rectangle around the defective element. For a gap, alignment or rhythm defect,
  the union of the elements whose relation is wrong. For a missing element, the rectangle where the artboard draws
  it. For a whole-region judgement (a region that looks squeezed), that region.
- A box must lie inside the PNG. A finding without a box that a refuter can crop is not a finding.

## 3. Severity

| Severity | Definition | Examples |
|---|---|---|
| `blocking` | Breaks function or information, or makes the state read as not built-in at first glance at 1:1 | An artboard element missing or an extra one; text clipped or truncated where the spec declares no truncation; two siblings overlapping, or an element touching a border, the scrollbar or the pane edge; the content of another state (an empty-state message beside rows); focus or selection invisible or on the wrong element in a focus or selection state; text hard to read on its background; a control drawn as a browser default; a whole region in the wrong colour role |
| `major` | Visible at 1:1 when looking for it; contradicts the spec or a rule; no information lost | Edges meant to coincide that visibly do not; asymmetric start/end or top/bottom insets on a header, toolbar or control row; a gap outside the spacing scale, or two same-role gaps that differ; a control or row height different from the spec; a region that looks squeezed or loose against the artboard; a wrong colour role on hover, secondary text, a divider or a badge; mixed icon sizes or a text glyph where the spec draws a codicon; label casing or punctuation against the copy rules |
| `minor` | Polish a user notices only side by side | Optical centring of a glyph; a secondary text one size or weight step off; wording that is correct but longer than needed |

Once the plan's hardness rule is met, zero standing `blocking` findings is a hard gate. Before that, and for `major`
and `minor` always, every standing finding is fixed or carries a design-advisor ruling.

## 4. The questions

Each question names the exemplar the workbench offers. The `spec.json` is the target: where it departs from the
exemplar, that is a design decision and not a finding (§6). Exemplar numbers are the research probe's (VS Code
1.142.0, Dark Modern, classic look unless marked Modern UI); the Design System rule ids carry the full text.

| Id | Question | Exemplar | Rules |
|---|---|---|---|
| Q1 Headers | Does every section header read like a VS Code pane header: height, title size, weight and casing for the look the capture shows, chevron, count badge and actions at the end with the end inset? | Pane header 22 px, 11 px/700 uppercase (classic); 28 px, 12 px/600 capitalised with a 4 px radius (Modern UI) | DS-HEIGHT-1, DS-TYPE, DS-INSET-3 |
| Q2 Rows | Do rows read like the Extensions view (panel) and the tree rows of a side-bar pane (sidebar): one icon column and one text column per list, the name truncating last, actions inside the hover and selection band? | Extensions row 72 px, 36 px icon, 16 px start inset; tree row 22 px | DS-ROW-1..6, DS-HEIGHT-2/3 |
| Q3 Controls | Do buttons, inputs, selects, check boxes, tabs and badges look like the workbench's own: height, radius, font size, primary versus secondary role, disabled appearance? | Text button 26 px, 12 px font, radius 4; input 25–26 px; check box 18 px, radius 3; count badge an 18 px pill; editor tab strip 35 px | DS-HEIGHT-4..11 |
| Q4 Insets | Is there one content inset per surface, and does every header, toolbar and control row have equal start and end insets and equal top and bottom padding? Does every trailing badge, count or action keep the end inset? | Extensions row padding 16 px; Settings header 24/24 | DS-INSET-1..4 |
| Q5 Rhythm | Do vertical gaps come from the spacing scale, are same-role gaps equal, do blocks use at most two gap values (4 inside a group, 8 between groups), does a section header sit closer to its rows than to the block above? Does anything look squeezed or loose against the artboard? | The spacing ramp {0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40} | DS-GRID-1/2 |
| Q6 Colour roles | Are selection, inactive selection, hover, focus, icon, secondary text, link, badge and divider each drawn in their workbench role, with no colour used as decoration and `focusBorder` used for focus only? | `list.activeSelectionBackground` with a 1 px `focusBorder` outline; `list.inactiveSelectionBackground` when unfocused; `toolbar.hoverBackground` on icon buttons | DS-COLOR-1..7 |
| Q7 Focus and selection | Is focus a 1 px ring on the focused element only, does the selection band cover the whole row including its actions, does hover never paint over selection, does the look's focus rule hold (classic: also after a click; Modern UI: keyboard only)? | Explorer and Extensions lists | DS-FOCUS-1..4, DS-ROW-3 |
| Q8 States | Do empty, loading, revalidating, error, partial and unsupported states look like the workbench's welcome views and inline messages, with progress where the work is and every disabled control saying why? | Welcome view text and buttons; the 2 px progress bar under a pane header | DS-STATE-1..7 |
| Q9 Copy | Are labels and commands in Title Case and messages in sentence case ending with a period, with no colon on label–value pairs, `...` on commands that open UI, and one count style per surface? | Workbench command and setting labels | DS-COPY-1..5 |
| Q10 Icons | Are icons codicons at 16 px in `icon.foreground` (12 px inline), the Verified mark the workbench's, chevrons drawn as codicons rather than text glyphs? | Extensions view actions and Verified mark | DS-ICON-1..5 |
| Q11 Overflow | At the capture's width, is there no horizontal scroll, no collision, and does every row of controls show its declared overflow behaviour (wrap, icon-only, overflow menu, hide by priority)? | Side bar at 170 px, editor at 220 px | DS-OVERFLOW-1..5 |
| Q12 Dividers and layers | Is there no line between rows, elevation only on layers, one divider role per surface, a scrim and a dialog that match the workbench's dialogs? | Quick input, workbench dialogs | DS-DIVIDER-1..4 |
| Q13 Motion | In a reduced-motion capture, is nothing mid-transition; in a motion capture, is the state between frames plausible (judge-only)? | `body.vscode-reduce-motion` | DS-MOTION-1..2 |

## 5. The three lenses

Each judge answers through its lens. A finding stands only when at least two judges report the same defect
(overlapping boxes, and the refuter groups them as one defect) and the refuter confirms it. So every question has a
primary lens, which examines it closely, and a secondary lens, which reports what it sees at 1:1: each defect can
reach two judges, and a defect only one judge can see stays informational (`singleJudge`, §9).

| Lens | Asks | Primary | Secondary |
|---|---|---|---|
| `native` — native parity | Would a VS Code user take this for a built-in view that manages NuGet packages? Compare with the exemplars. | Q1, Q2, Q3, Q6, Q7, Q10, Q12 | Q4, Q5 (as "looks squeezed or loose"), Q8, Q9, Q13 |
| `geometry` — geometry | Do edges, gaps, insets, heights and overflow match the `spec.json` and the rules? Compare positions with the spec's numbers and the artboard. | Q4, Q5, Q11 | Q1–Q3 (heights and edges), Q12, completeness |
| `states` — states and copy | Is every element of the artboard present and nothing extra, does the state show what its name says, is every interaction state drawn, is the copy right? | Q8, Q9, Q13, completeness against the artboard | Q6, Q7, Q10, Q11 |

Completeness means: every element the artboard draws is in the capture, nothing the artboard lacks is in the
capture, and the state shows the content its name promises.

## 6. What is not a finding

- A difference the `spec.json` declares: an allowed truncation or overflow, a masked or live-content region, a rect or
  token that differs from the exemplar on purpose. Where the artboard drawing and the spec disagree, the spec wins;
  report the disagreement once as `minor` with rule `spec-conflict`.
- Live content: package ids, versions, authors, download counts, descriptions, README text, dates, source names and
  count values, as long as the layout around them holds.
- Font rendering, anti-aliasing and glyph shapes that differ between the artboard (rendered in a browser) and the
  capture (VS Code under xvfb): compare geometry and colour roles, not glyph outlines.
- The theme's own colours: the capture resolves the real `--vscode-*` values of its theme; judge the role, not the
  hex value.
- Anything outside the webview crop, and the mouse pointer.
- Taste with no rule, artboard element or exemplar to cite ("could look more modern"), and feature suggestions.

## 7. The refuter

One refuter per state receives every candidate finding of that state and tries to falsify each one:

1. Crop the box: `node scripts/crop-png.mjs <png> <x> <y> <w> <h> <out>` with `<out>` under
   `captures/<run-id>/crops/`, padded by 16 px on each side, then open the crop with Read; crop the artboard at the
   same box when the finding compares with it. The Read tool cannot crop; when `scripts/crop-png.mjs` is missing, open
   the whole PNG, locate the box by its coordinates and record the method `full-png`.
2. Check the box lies inside the PNG and covers what the finding names.
3. Check the spec: a declared difference refutes the finding.
4. Check the measurements when the workflow was given them: a `hard` measurement that contradicts the finding
   (equal edges within 1 px where the judge saw misalignment) refutes it, with the measured value as the reason.
5. Check §6. Default to `refuted` when the defect is not visible in the crop.

The refuter gives every finding its own verdict and gives the confirmed findings that describe the same defect one
shared defect key. The workflow then counts, per key, the judges whose boxes overlap: two or more and the defect
stands; one and it is `singleJudge`.

## 8. Listing rubric (the README page)

The README is the Marketplace page and is judged as marketing copy. The capture is the rendered page (the research
names VS Code's own Extensions view in ExTester as the reproducible renderer), cut into screens of the capture
viewport's height; "the first screen" is the top one.

| Id | Question | Lenses (primary, secondary) |
|---|---|---|
| L1 Value proposition | Within the first screen, without scrolling: a one-line value proposition that says what the extension does and for whom, the hero image showing the product, and the install and rating badges? | `native`, `states` |
| L2 Scannable | Do headings name user benefits, does each feature section have a one-sentence benefit and one image, are paragraphs short at the reference width, are settings and commands in tables? | `geometry`, `native` |
| L3 Consistent framing | Do all screenshots share window size, theme, crop, scale and border treatment, with no blurry or upscaled image and the same caption style? | `geometry`, `states` |
| L4 Professional | No developer content (build, test, architecture, plan or ledger ids, file paths, internal names), no broken or placeholder image, consistent casing and punctuation, correct spelling, few badges and only from allowed hosts? | `states`, `native` |
| L5 Requirements | Are the requirements stated as a user sees them (the .NET SDK 10 floor), with known limitations listed plainly? | `states`, `geometry` |

Severity for the listing: `blocking` for a first screen without a value proposition or hero, a broken image, or
developer content; `major` for inconsistent framing or a section without a benefit; `minor` for wording. Boxes are
CSS px of the rendered page PNG, origin top-left.

## 9. Recording the outcome

The implementing session writes the workflow's result into `docs/plans/judge-log/<item>.json` (the directory is
created by P0). Every standing finding gets a disposition; the disposition rate (refuted-by-measurement over all
dispositions) is what the hardness rule and the phase reviews compute.

```json
{
  "item": "<item id>",
  "runs": [
    {
      "runId": "<run-id>",
      "rubric": "<git hash-object docs/design/judge-rubric.md>",
      "captures": {
        "main-installed-single": {
          "png": "captures/<run-id>/main-installed-single.dark-modern.1200.png",
          "sha256": "<hex>"
        }
      },
      "panel": { "candidates": 3, "standing": 1, "refuted": 2, "singleJudge": 0 },
      "singleJudge": [],
      "findings": [
        {
          "id": "main-installed-single#1",
          "state": "main-installed-single",
          "finding": "The bulk toolbar starts at the 16 px inset but ends at x 577, 6 px short of the list's right edge.",
          "severity": "major",
          "box": [16, 98, 568, 24],
          "rule": "DS-INSET-2",
          "lenses": ["native", "geometry"],
          "disposition": "fixed",
          "evidence": "re-run <run-id>: no longer standing",
          "ruling": "STATUS.md, Advisor decisions, <date> <item id>"
        }
      ]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `disposition` | `fixed` (the finding no longer stands in a later run), `refuted-by-measurement` (a measured value contradicts it) or `accepted-as-design` (the spec, the artboard or a `DECISIONS.md` row declares it) |
| `evidence` | For `fixed`, the run id of the re-run; for `refuted-by-measurement`, the measured value; for `accepted-as-design`, the spec line or the decision row |
| `ruling` | The design-advisor's ruling, verbatim or as the `STATUS.md` heading where it is pasted; required for every disposition other than `fixed` |
| `singleJudge` | Findings one judge reported and the refuter confirmed; informational, no disposition, but the design-advisor may promote one |
